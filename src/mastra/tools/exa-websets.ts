import Exa, { type CreateEnrichmentParameters, CreateEnrichmentParametersFormat } from "exa-js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { env } from "@/lib/config/env";

const exa = new Exa(env.EXA_API_KEY);

const MAX_POLL_ITERATIONS = 30;
const POLL_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Dedup cache — prevents creating duplicate websets for the same query
// ---------------------------------------------------------------------------
const DEDUP_TTL_MS = 30 * 60 * 1000; // 30 minutes
const websetCache = new Map<string, { websetId: string; createdAt: number }>();

function websetCacheKey(query: string, entity: string, count: number): string {
  return `${entity}:${count}:${query.trim().toLowerCase()}`;
}

function getCachedWebsetId(key: string): string | null {
  const entry = websetCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DEDUP_TTL_MS) {
    websetCache.delete(key);
    return null;
  }
  return entry.websetId;
}

function setCachedWebsetId(key: string, websetId: string): void {
  websetCache.set(key, { websetId, createdAt: Date.now() });
}

async function pollWebsetUntilDone(websetId: string) {
  for (let i = 0; i < MAX_POLL_ITERATIONS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const webset = await exa.websets.get(websetId);
    if (webset.status !== "running") {
      return webset;
    }
  }
  throw new Error("Webset timed out after 5 minutes");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchWebsetItems(websetId: string): Promise<any[]> {
  const response = await exa.websets.items.list(websetId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any).data ?? (response as any).items ?? [];
}

export const exaWebsetCreateTool = createTool({
  id: "exa-webset-create",
  description:
    "Creates an Exa Webset to discover companies or people with optional enrichments, and polls until complete.",
  inputSchema: z.object({
    query: z.string(),
    entity: z.enum(["company", "person"]),
    count: z.number().int().min(1).max(100),
    criteria: z.array(z.string()).max(5).default([]),
    enrichments: z
      .array(
        z.object({
          description: z.string(),
          format: z
            .enum(["text", "email", "phone", "url", "number", "date"])
            .default("text"),
        }),
      )
      .default([]),
  }),
  outputSchema: z.object({
    websetId: z.string(),
    status: z.string(),
    itemCount: z.number(),
    items: z.array(z.any()),
  }),
  execute: async (inputData, context) => {
    void context;
    const cacheKey = websetCacheKey(inputData.query, inputData.entity, inputData.count);
    const cachedId = getCachedWebsetId(cacheKey);

    if (cachedId) {
      const existing = await exa.websets.get(cachedId);
      if (existing.status !== "running") {
        const items = await fetchWebsetItems(cachedId);
        return { websetId: cachedId, status: existing.status, itemCount: items.length, items };
      }
      const completed = await pollWebsetUntilDone(cachedId);
      const items = await fetchWebsetItems(cachedId);
      return { websetId: cachedId, status: completed.status, itemCount: items.length, items };
    }

    const searchCriteria = inputData.criteria?.map((description) => ({
      description,
    }));

    const webset = await exa.websets.create({
      search: {
        query: inputData.query,
        entity: { type: inputData.entity },
        count: inputData.count,
        ...(searchCriteria?.length ? { criteria: searchCriteria } : {}),
      },
      ...(inputData.enrichments?.length
        ? { enrichments: inputData.enrichments as CreateEnrichmentParameters[] }
        : {}),
    });

    setCachedWebsetId(cacheKey, webset.id);
    const completed = await pollWebsetUntilDone(webset.id);
    const items = await fetchWebsetItems(webset.id);

    return {
      websetId: webset.id,
      status: completed.status,
      itemCount: items.length,
      items,
    };
  },
});

export const exaWebsetGetItemsTool = createTool({
  id: "exa-webset-get-items",
  description: "Lists items from a completed Exa Webset.",
  inputSchema: z.object({
    websetId: z.string(),
  }),
  outputSchema: z.object({
    items: z.array(z.any()),
  }),
  execute: async (inputData, context) => {
    void context;
    const items = await fetchWebsetItems(inputData.websetId);
    return { items };
  },
});

export const exaWebsetSearchPeopleTool = createTool({
  id: "exa-webset-search-people",
  description:
    "Searches for people using Exa Websets with optional email and phone enrichment. Returns structured results.",
  inputSchema: z.object({
    query: z.string(),
    count: z.number().int().min(1).max(100),
  }),
  outputSchema: z.object({
    websetId: z.string(),
    status: z.string(),
    itemCount: z.number(),
    items: z.array(z.any()),
  }),
  execute: async (inputData, context) => {
    void context;
    const cacheKey = websetCacheKey(inputData.query, "person", inputData.count);
    const cachedId = getCachedWebsetId(cacheKey);

    if (cachedId) {
      const existing = await exa.websets.get(cachedId);
      if (existing.status !== "running") {
        const items = await fetchWebsetItems(cachedId);
        return { websetId: cachedId, status: existing.status, itemCount: items.length, items };
      }
      const completed = await pollWebsetUntilDone(cachedId);
      const items = await fetchWebsetItems(cachedId);
      return { websetId: cachedId, status: completed.status, itemCount: items.length, items };
    }

    const enrichments: CreateEnrichmentParameters[] = [
      {
        description: "Find the work email address for this person",
        format: CreateEnrichmentParametersFormat.email,
      },
    ];

    const webset = await exa.websets.create({
      search: {
        query: inputData.query,
        entity: { type: "person" },
        count: inputData.count,
      },
      enrichments,
    });

    setCachedWebsetId(cacheKey, webset.id);
    const completed = await pollWebsetUntilDone(webset.id);
    const items = await fetchWebsetItems(webset.id);

    return {
      websetId: webset.id,
      status: completed.status,
      itemCount: items.length,
      items,
    };
  },
});

// ---------------------------------------------------------------------------
// Webset item parser — converts raw webset person items into leads + contacts
// ---------------------------------------------------------------------------

type ParsedLead = {
  campaign_id: string;
  pipeline_run_id: string;
  source: "exa_websets";
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  exa_url: string | null;
  raw_data: Record<string, unknown>;
  status: "enriched";
};

type ParsedContact = {
  campaign_id: string;
  name: string | null;
  first_name: string | null;
  email: string | null;
  email_verified: boolean;
  linkedin_url: string | null;
  headline: string | null;
  company_name: string | null;
  location: string | null;
  role_summary: string | null;
  contact_brief: string | null;
  enriched_at: string;
};

function companyKeyFromItem(person: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company = (person as any)?.company;
  const name = (company?.name ?? "").trim().toLowerCase();
  const linkedinUrl = (company?.linkedinUrl ?? "").trim().toLowerCase().replace(/\/+$/, "");
  if (linkedinUrl) return `li:${linkedinUrl}`;
  if (name) return `name:${name}`;
  return `unknown:${Math.random()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEmail(item: any): string | null {
  for (const enrichment of item.enrichments ?? []) {
    if (enrichment.format === "email" && enrichment.result?.length) {
      return enrichment.result[0];
    }
  }
  return null;
}

export function parseWebsetPeopleItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  campaignId: string,
  runId: string,
): { leads: ParsedLead[]; contactsByCompanyKey: Map<string, ParsedContact[]> } {
  const leadMap = new Map<string, ParsedLead>();
  const contactsByCompanyKey = new Map<string, ParsedContact[]>();
  const now = new Date().toISOString();

  for (const item of items) {
    const props = item.properties ?? {};
    const person = props.person ?? {};
    const company = person.company ?? {};
    const companyName: string | null = company.name ?? null;
    const companyLinkedinRaw: string | null = company.linkedinUrl ?? null;
    const companyLinkedin = companyLinkedinRaw
      ? (companyLinkedinRaw.startsWith("http") ? companyLinkedinRaw : `https://${companyLinkedinRaw}`)
      : null;
    const personLinkedin: string | null = props.url ?? null;
    const email = extractEmail(item);
    const personName: string | null = person.name ?? null;

    const key = companyKeyFromItem(person);

    if (!leadMap.has(key)) {
      leadMap.set(key, {
        campaign_id: campaignId,
        pipeline_run_id: runId,
        source: "exa_websets",
        company_name: companyName,
        company_domain: null,
        linkedin_url: companyLinkedin,
        exa_url: companyLinkedin,
        raw_data: { company, evaluations: item.evaluations ?? [] },
        status: "enriched",
      });
    }

    const contacts = contactsByCompanyKey.get(key) ?? [];
    contacts.push({
      campaign_id: campaignId,
      name: personName,
      first_name: personName?.split(" ")[0] ?? null,
      email,
      email_verified: false,
      linkedin_url: personLinkedin,
      headline: person.position ?? null,
      company_name: companyName,
      location: person.location ?? null,
      role_summary: props.description ?? null,
      contact_brief: props.description ?? null,
      enriched_at: now,
    });
    contactsByCompanyKey.set(key, contacts);
  }

  return { leads: Array.from(leadMap.values()), contactsByCompanyKey };
}

export const exaWebsetSearchCompaniesTool = createTool({
  id: "exa-webset-search-companies",
  description:
    "Searches for companies using Exa Websets with natural language criteria filters.",
  inputSchema: z.object({
    query: z.string(),
    count: z.number().int().min(1).max(100),
    criteria: z.array(z.string()).max(5).optional(),
  }),
  outputSchema: z.object({
    websetId: z.string(),
    status: z.string(),
    itemCount: z.number(),
    items: z.array(z.any()),
  }),
  execute: async (inputData, context) => {
    void context;
    const cacheKey = websetCacheKey(inputData.query, "company", inputData.count);
    const cachedId = getCachedWebsetId(cacheKey);

    if (cachedId) {
      const existing = await exa.websets.get(cachedId);
      if (existing.status !== "running") {
        const items = await fetchWebsetItems(cachedId);
        return { websetId: cachedId, status: existing.status, itemCount: items.length, items };
      }
      const completed = await pollWebsetUntilDone(cachedId);
      const items = await fetchWebsetItems(cachedId);
      return { websetId: cachedId, status: completed.status, itemCount: items.length, items };
    }

    const searchCriteria = inputData.criteria?.map((description) => ({
      description,
    }));

    const webset = await exa.websets.create({
      search: {
        query: inputData.query,
        entity: { type: "company" },
        count: inputData.count,
        ...(searchCriteria?.length ? { criteria: searchCriteria } : {}),
      },
    });

    setCachedWebsetId(cacheKey, webset.id);
    const completed = await pollWebsetUntilDone(webset.id);
    const items = await fetchWebsetItems(webset.id);

    return {
      websetId: webset.id,
      status: completed.status,
      itemCount: items.length,
      items,
    };
  },
});
