import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { env } from "@/lib/config/env";

const CLADO_BASE = "https://search.clado.ai";

const authHeaders = {
  Authorization: `Bearer ${env.CLADO_API_KEY}`,
};

async function readCladoResponse(res: Response) {
  const data = await res.json().catch(() => null);
  console.log("data", data);
  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail?: unknown }).detail ?? "")
        : JSON.stringify(data);
    throw new Error(`Clado API request failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  return data;
}

export const cladoSearchPeopleTool = createTool({
  id: "clado-search-people",
  description: "Searches LinkedIn people with natural-language criteria.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(10),
    advanced_filtering: z.boolean(),
    search_id: z.string().nullable(),
    offset: z.number().nullable(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const url = new URL(`${CLADO_BASE}/api/search`);
    const cappedLimit = Math.min(Math.max(1, inputData.limit), 30);
    url.searchParams.set("query", inputData.query);
    url.searchParams.set("limit", String(cappedLimit));
    url.searchParams.set("advanced_filtering", String(inputData.advanced_filtering));
    url.searchParams.set("legacy", "false");
    if (inputData.search_id) url.searchParams.set("search_id", inputData.search_id);
    if (typeof inputData.offset === "number") url.searchParams.set("offset", String(inputData.offset));

    const res = await fetch(url, { headers: authHeaders });
    const data = await readCladoResponse(res);
    return { data };
  },
});

export const cladoDeepResearchTool = createTool({
  id: "clado-deep-research",
  description: "Runs async deep research and polls until completion.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number(),
    hard_filter_company_urls: z.array(z.string()),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const start = await fetch(`${CLADO_BASE}/api/search/deep_research`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputData),
    });
    const startBody = await readCladoResponse(start);
    const jobId = startBody.job_id as string;
    if (!jobId) {
      throw new Error("Clado deep research did not return job_id");
    }

    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      const statusRes = await fetch(`${CLADO_BASE}/api/search/deep_research/${jobId}`, {
        headers: authHeaders,
      });
      const status = await readCladoResponse(statusRes);
      if (status.status === "completed") {
        return { data: status };
      }
      if (status.status === "failed") {
        throw new Error(status.message ?? "Clado deep research failed");
      }
    }

    throw new Error("Clado deep research timed out");
  },
});

export const cladoEnrichContactTool = createTool({
  id: "clado-enrich-contact",
  description: "Enriches LinkedIn profile with verified contact details.",
  inputSchema: z.object({
    linkedin_url: z.string(),
    email_enrichment: z.boolean(),
    phone_enrichment: z.boolean(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const url = new URL(`${CLADO_BASE}/api/enrich/contacts`);
    url.searchParams.set("linkedin_url", inputData.linkedin_url);
    if (inputData.email_enrichment) url.searchParams.set("email_enrichment", "true");
    if (inputData.phone_enrichment) url.searchParams.set("phone_enrichment", "true");

    const res = await fetch(url, { headers: authHeaders });
    const data = await readCladoResponse(res);
    return { data };
  },
});

export const cladoGetProfileTool = createTool({
  id: "clado-get-profile",
  description: "Returns profile data for a LinkedIn URL.",
  inputSchema: z.object({
    linkedin_url: z.string(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const url = new URL(`${CLADO_BASE}/api/enrich/linkedin`);
    url.searchParams.set("linkedin_url", inputData.linkedin_url);
    const res = await fetch(url, { headers: authHeaders });
    const data = await readCladoResponse(res);
    return { data };
  },
});

export const cladoScrapeLinkedinProfileTool = createTool({
  id: "clado-scrape-linkedin-profile",
  description: "Scrapes the latest LinkedIn profile data, including recent activity.",
  inputSchema: z.object({
    linkedin_url: z.string(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const url = new URL(`${CLADO_BASE}/api/enrich/scrape`);
    url.searchParams.set("linkedin_url", inputData.linkedin_url);
    const res = await fetch(url, { headers: authHeaders });
    const data = await readCladoResponse(res);
    return { data };
  },
});

export const cladoGetPostReactionsTool = createTool({
  id: "clado-get-post-reactions",
  description: "Gets LinkedIn post reactions, including reaction types and reacting profiles.",
  inputSchema: z.object({
    url: z.string(),
    page: z.number().int().positive().optional(),
    reaction_type: z.string().optional(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (inputData) => {
    const url = new URL(`${CLADO_BASE}/api/enrich/post-reactions`);
    url.searchParams.set("url", inputData.url);
    if (typeof inputData.page === "number") url.searchParams.set("page", String(inputData.page));
    if (inputData.reaction_type) url.searchParams.set("reaction_type", inputData.reaction_type);
    const res = await fetch(url, { headers: authHeaders });
    const data = await readCladoResponse(res);
    return { data };
  },
});
