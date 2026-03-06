import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRuntimeAgent } from "@/lib/agents/build-runtime-agent";
import { logRunEvent, updateRunState } from "@/lib/pipeline/run-state";
import { supabaseServer } from "@/lib/supabase/server";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const discoveredContactsSchema = z.object({
  contacts: z.array(
    z.object({
      name: z.string().nullable(),
      first_name: z.string().nullable(),
      linkedin_url: z.string().nullable(),
      headline: z.string().nullable(),
      company_name: z.string().nullable(),
      raw_data: z.string().nullable(),
    }),
  ),
});

type DiscoveredContact = z.infer<typeof discoveredContactsSchema>["contacts"][number] & {
  source: "exa" | "clado";
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLinkedinUrl(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function contactKey(value: { linkedin_url: string | null; name: string | null }) {
  const linkedinUrl = normalizeLinkedinUrl(value.linkedin_url);
  if (linkedinUrl) return `li:${linkedinUrl}`;
  const name = normalizeText(value.name);
  if (name) return `name:${name}`;
  return null;
}

function safeParseJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : { data: value };
  } catch {
    return { data: value };
  }
}

async function discoverFromBranch(input: {
  runId: string;
  lead: {
    id: string;
    campaign_id: string | null;
    company_name: string | null;
    company_domain: string | null;
    linkedin_url: string | null;
    exa_url: string | null;
    raw_data: Record<string, unknown> | null;
  };
  campaign: {
    name: string | null;
    icp_description: string | null;
    target_roles: string[] | null;
  } | null;
  source: "exa" | "clado";
  requestedToolKeys: string[];
}) {
  await logRunEvent(
    input.runId,
    "people_gen",
    "info",
    `${input.source.toUpperCase()} contact discovery branch started`,
    {
      source: input.source,
      requestedToolKeys: input.requestedToolKeys,
    },
  );
  const runtime = await buildRuntimeAgent("people_gen", {
    requestedToolKeys: input.requestedToolKeys,
  });
  await logRunEvent(
    input.runId,
    "people_gen",
    "info",
    `${input.source.toUpperCase()} runtime loaded`,
    {
      source: input.source,
      configVersionId: runtime.config.configVersionId,
      toolsEnabled: runtime.toolKeys,
      toolsRejected: runtime.rejectedToolKeys,
    },
  );

  const prompt = [
    "Find potential B2B contacts at the target company for outbound outreach.",
    "Prioritize people matching campaign target roles.",
    "Return JSON with contacts only; avoid duplicates.",
    "",
    "Company context:",
    `company_name: ${input.lead.company_name ?? ""}`,
    `company_domain: ${input.lead.company_domain ?? ""}`,
    `linkedin_url: ${input.lead.linkedin_url ?? ""}`,
    `exa_url: ${input.lead.exa_url ?? ""}`,
    `raw_data: ${JSON.stringify(input.lead.raw_data ?? {})}`,
    "",
    "Campaign context:",
    `campaign_name: ${input.campaign?.name ?? ""}`,
    `icp_description: ${input.campaign?.icp_description ?? ""}`,
    `target_roles: ${JSON.stringify(input.campaign?.target_roles ?? [])}`,
    "",
    `You are running the ${input.source.toUpperCase()} discovery branch.`,
    "Collect likely prospects with best available signals, and include concise raw_data evidence per contact.",
  ].join("\n");

  const stream = await runtime.agent.stream(runtime.preparePrompt(prompt), {
    structuredOutput: { schema: discoveredContactsSchema },
    maxSteps: 10,
  });

  const result = await stream.object;
  await logRunEvent(
    input.runId,
    "people_gen",
    "success",
    `${input.source.toUpperCase()} branch completed`,
    {
      source: input.source,
      discoveredCount: result.contacts.length,
    },
  );
  return result.contacts.map((contact) => ({
    ...contact,
    source: input.source,
  })) as DiscoveredContact[];
}

async function runFindContacts(runId: string, leadId: string) {
  await updateRunState(runId, {
    status: "running",
    current_stage: "people_discovery",
  });
  const { data: lead } = await supabaseServer
    .from("leads")
    .select("id,campaign_id,company_name,company_domain,linkedin_url,exa_url,raw_data")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    await updateRunState(runId, {
      status: "failed",
      current_stage: "failed",
      error: "Lead not found",
      finished_at: new Date().toISOString(),
    });
    await logRunEvent(runId, "people_gen", "error", "Find contacts failed: lead not found", {
      leadId,
    });
    return;
  }

  const { data: campaign } = lead.campaign_id
    ? await supabaseServer
        .from("campaigns")
        .select("name,icp_description,target_roles")
        .eq("id", lead.campaign_id)
        .maybeSingle()
    : { data: null };

  await logRunEvent(runId, "people_gen", "info", "Find contacts started", {
    leadId: lead.id,
    campaignId: lead.campaign_id,
    companyName: lead.company_name,
    companyDomain: lead.company_domain,
  });

  const [exaResult, cladoResult] = await Promise.allSettled([
    discoverFromBranch({
      runId,
      lead,
      campaign,
      source: "exa",
      requestedToolKeys: ["exa.search", "exa.research"],
    }),
    discoverFromBranch({
      runId,
      lead,
      campaign,
      source: "clado",
      requestedToolKeys: ["clado.search_people", "clado.deep_research"],
    }),
  ]);

  const discovered: DiscoveredContact[] = [];
  if (exaResult.status === "fulfilled") {
    discovered.push(...exaResult.value);
  } else {
    await logRunEvent(runId, "people_gen", "warn", "EXA branch failed", {
      error: exaResult.reason instanceof Error ? exaResult.reason.message : String(exaResult.reason),
    });
  }
  if (cladoResult.status === "fulfilled") {
    discovered.push(...cladoResult.value);
  } else {
    await logRunEvent(runId, "people_gen", "warn", "Clado branch failed", {
      error: cladoResult.reason instanceof Error ? cladoResult.reason.message : String(cladoResult.reason),
    });
  }
  if (!discovered.length) {
    await logRunEvent(runId, "people_gen", "error", "No contacts discovered by any branch", {
      leadId: lead.id,
    });
    await updateRunState(runId, {
      status: "failed",
      current_stage: "failed",
      error: "No contacts discovered by any branch",
      finished_at: new Date().toISOString(),
    });
    return;
  }

  const { data: existingContacts } = await supabaseServer
    .from("contacts")
    .select("id,lead_id,linkedin_url,name")
    .eq("lead_id", lead.id);

  const existingKeys = new Set(
    (existingContacts ?? [])
      .map((contact) => contactKey(contact))
      .filter((key): key is string => Boolean(key)),
  );
  const seenBatchKeys = new Set<string>();

  const contactsToInsert = discovered
    .filter((contact) => {
      const key = contactKey(contact);
      if (!key) return false;
      if (existingKeys.has(key) || seenBatchKeys.has(key)) return false;
      seenBatchKeys.add(key);
      return true;
    })
    .map((contact) => ({
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      name: contact.name ?? null,
      first_name: contact.first_name ?? null,
      email: null,
      email_verified: false,
      phone: null,
      linkedin_url: contact.linkedin_url ?? null,
      headline: contact.headline ?? null,
      company_name: contact.company_name ?? lead.company_name ?? null,
      clado_profile: contact.source === "clado" ? safeParseJson(contact.raw_data) : {},
      exa_company_signals: contact.source === "exa" ? safeParseJson(contact.raw_data) : {},
      contact_brief: null,
    }));

  if (!contactsToInsert.length) {
    await logRunEvent(runId, "people_gen", "info", "No net-new contacts after dedupe", {
      leadId: lead.id,
      discoveredCount: discovered.length,
      existingCount: existingContacts?.length ?? 0,
    });
    await updateRunState(runId, {
      status: "completed",
      current_stage: "completed",
      leads_generated: 0,
      finished_at: new Date().toISOString(),
      error: null,
    });
    return;
  }

  await supabaseServer.from("contacts").insert(contactsToInsert);
  await supabaseServer.from("leads").update({ status: "enriching" }).eq("id", lead.id);

  for (const inserted of contactsToInsert.slice(0, 30)) {
    await logRunEvent(runId, "people_gen", "info", "Inserted discovered contact", {
      leadId: inserted.lead_id,
      name: inserted.name,
      linkedinUrl: inserted.linkedin_url,
      companyName: inserted.company_name,
    });
  }

  await logRunEvent(runId, "people_gen", "success", "Find contacts completed", {
    leadId: lead.id,
    discoveredCount: discovered.length,
    insertedCount: contactsToInsert.length,
    insertedLogLimit: 30,
  });
  await updateRunState(runId, {
    status: "completed",
    current_stage: "completed",
    leads_generated: contactsToInsert.length,
    finished_at: new Date().toISOString(),
    error: null,
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const { data: lead } = await supabaseServer
    .from("leads")
    .select("id,campaign_id,company_name,company_domain")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const { data: run, error: runError } = await supabaseServer
    .from("pipeline_runs")
    .insert({
      campaign_id: lead.campaign_id,
      trigger: "manual",
      status: "running",
      current_stage: "queued",
      run_mode: "custom",
      start_stage: "people_discovery",
      end_stage: "people_discovery",
      selected_stages: ["people_discovery"],
      run_config: {
        action: "lead_find_contacts",
        leadId: lead.id,
      },
    })
    .select("id")
    .single();
  if (runError || !run) {
    return NextResponse.json(
      { ok: false, error: runError?.message ?? "Failed to create run" },
      { status: 500 },
    );
  }
  await logRunEvent(run.id, "pipeline", "info", "Find contacts queued", {
    leadId: lead.id,
    campaignId: lead.campaign_id,
    companyName: lead.company_name,
    companyDomain: lead.company_domain,
  });

  void runFindContacts(run.id, parsed.data.id);
  return NextResponse.json({
    ok: true,
    queued: true,
    leadId: parsed.data.id,
    runId: run.id,
  });
}
