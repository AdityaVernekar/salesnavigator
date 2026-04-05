import { NextResponse } from "next/server";
import { z } from "zod";
import type Exa from "exa-js";
import { env } from "@/lib/config/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

let _exa: Exa | null = null;
async function getExa(): Promise<Exa> {
  if (!_exa) {
    const { default: ExaClient } = await import("exa-js");
    _exa = new ExaClient(env.EXA_API_KEY);
  }
  return _exa;
}

const MAX_POLL_ITERATIONS = 30;
const POLL_INTERVAL_MS = 10_000;

const requestSchema = z.object({
  action: z.enum(["search_companies", "search_people", "get_items", "get_status", "save_as_leads"]),
  query: z.string().optional(),
  count: z.number().int().min(1).max(100).optional(),
  criteria: z.array(z.string()).optional(),
  websetId: z.string().optional(),
  pollUntilDone: z.boolean().optional(),
  campaignId: z.string().uuid().optional(),
  items: z.array(z.any()).optional(),
});

async function pollWebsetUntilDone(websetId: string) {
  const exa = await getExa();
  for (let i = 0; i < MAX_POLL_ITERATIONS; i++) {
    const webset = await exa.websets.get(websetId);
    if (webset.status !== "running") {
      return webset;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return exa.websets.get(websetId);
}

async function fetchWebsetItems(websetId: string) {
  const exa = await getExa();
  const items: unknown[] = [];
  let nextCursor: string | undefined;
  do {
    const page = await exa.websets.items.list(websetId, {
      cursor: nextCursor,
      limit: 100,
    });
    items.push(...page.data);
    nextCursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
  } while (nextCursor);
  return items;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues }, { status: 400 });
    }

    const { action, query, count, criteria, websetId, pollUntilDone: shouldPoll } = parsed.data;

    if (action === "search_companies") {
      if (!query) return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });
      const searchCriteria = criteria?.map((description) => ({ description }));
      const exa = await getExa();
      const webset = await exa.websets.create({
        search: {
          query,
          entity: { type: "company" },
          count: count ?? 5,
          ...(searchCriteria?.length ? { criteria: searchCriteria } : {}),
        },
      });

      if (shouldPoll) {
        const completed = await pollWebsetUntilDone(webset.id);
        const items = await fetchWebsetItems(webset.id);
        return NextResponse.json({
          ok: true,
          websetId: webset.id,
          status: completed.status,
          itemCount: items.length,
          items,
        });
      }

      return NextResponse.json({
        ok: true,
        websetId: webset.id,
        status: webset.status,
        message: "Webset created. Poll with get_status or get_items.",
      });
    }

    if (action === "search_people") {
      if (!query) return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });
      const exa = await getExa();
      const webset = await exa.websets.create({
        search: {
          query,
          entity: { type: "person" },
          count: count ?? 5,
        },
        enrichments: [
          { description: "Find the work email address for this person", format: "email" as never },
        ],
      });

      if (shouldPoll) {
        const completed = await pollWebsetUntilDone(webset.id);
        const items = await fetchWebsetItems(webset.id);
        return NextResponse.json({
          ok: true,
          websetId: webset.id,
          status: completed.status,
          itemCount: items.length,
          items,
        });
      }

      return NextResponse.json({
        ok: true,
        websetId: webset.id,
        status: webset.status,
        message: "Webset created. Poll with get_status or get_items.",
      });
    }

    if (action === "get_status") {
      if (!websetId) return NextResponse.json({ ok: false, error: "websetId required" }, { status: 400 });
      const exa = await getExa();
      const webset = await exa.websets.get(websetId);
      return NextResponse.json({
        ok: true,
        websetId: webset.id,
        status: webset.status,
      });
    }

    if (action === "get_items") {
      if (!websetId) return NextResponse.json({ ok: false, error: "websetId required" }, { status: 400 });
      const items = await fetchWebsetItems(websetId);
      return NextResponse.json({
        ok: true,
        websetId,
        itemCount: items.length,
        items,
      });
    }

    if (action === "save_as_leads") {
      const { campaignId, items: rawItems } = parsed.data;
      if (!campaignId) return NextResponse.json({ ok: false, error: "campaignId required" }, { status: 400 });
      if (!rawItems?.length) return NextResponse.json({ ok: false, error: "items required" }, { status: 400 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const websetItems = rawItems as any[];
      const leadsToInsert: Array<Record<string, unknown>> = [];
      const contactsByLeadIndex: Array<Array<Record<string, unknown>>> = [];

      for (const item of websetItems) {
        const props = item.properties ?? {};
        const person = props.person ?? {};
        const company = person.company ?? {};
        const companyName = company.name ?? null;
        const companyLinkedin = company.linkedinUrl ? `https://${company.linkedinUrl}` : null;
        const personLinkedin = props.url ?? null;

        // Extract email from enrichments
        let email: string | null = null;
        for (const enrichment of item.enrichments ?? []) {
          if (enrichment.format === "email" && enrichment.result?.length) {
            email = enrichment.result[0];
            break;
          }
        }

        leadsToInsert.push({
          campaign_id: campaignId,
          source: "exa",
          company_name: companyName,
          company_domain: null,
          linkedin_url: companyLinkedin,
          exa_url: props.url ?? null,
          raw_data: props,
          status: "enriched",
          company_description: props.description ?? null,
          researched_at: new Date().toISOString(),
        });

        contactsByLeadIndex.push([
          {
            campaign_id: campaignId,
            name: person.name ?? null,
            first_name: person.name?.split(" ")[0] ?? null,
            email,
            email_verified: false,
            linkedin_url: personLinkedin,
            headline: person.position ?? null,
            company_name: companyName,
            location: person.location ?? null,
            enriched_at: new Date().toISOString(),
            raw_data: person,
          },
        ]);
      }

      // Insert leads
      const { data: insertedLeads, error: leadsError } = await supabaseServer
        .from("leads")
        .insert(leadsToInsert)
        .select("id");

      if (leadsError || !insertedLeads) {
        return NextResponse.json({ ok: false, error: leadsError?.message ?? "Failed to insert leads" }, { status: 500 });
      }

      // Insert contacts with lead_id
      let contactsInserted = 0;
      for (let i = 0; i < insertedLeads.length; i++) {
        const leadId = insertedLeads[i].id;
        const contacts = contactsByLeadIndex[i] ?? [];
        if (!contacts.length) continue;

        const contactsWithLeadId = contacts.map((c) => ({ ...c, lead_id: leadId }));
        const { error: contactsError } = await supabaseServer.from("contacts").insert(contactsWithLeadId);
        if (!contactsError) contactsInserted += contactsWithLeadId.length;
      }

      return NextResponse.json({
        ok: true,
        leadsInserted: insertedLeads.length,
        contactsInserted,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
