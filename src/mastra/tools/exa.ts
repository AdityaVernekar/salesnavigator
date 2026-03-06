import Exa from "exa-js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { env } from "@/lib/config/env";

const exa = new Exa(env.EXA_API_KEY);

export const exaSearchTool = createTool({
  id: "exa-search",
  description: "Searches web content for ICP matching companies and signals.",
  inputSchema: z.object({
    query: z.string(),
    numResults: z.number(),
    type: z.enum(["auto", "neural", "keyword"]),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string().optional(),
        url: z.string(),
        text: z.string().optional(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    void context;
    const result = await exa.search(inputData.query, {
      numResults: inputData.numResults,
      type: inputData.type,
    });
    return {
      results: result.results.map((item) => ({
        title: item.title ?? undefined,
        url: item.url,
        text: item.text ?? undefined,
      })),
    };
  },
});

export const exaFindSimilarTool = createTool({
  id: "exa-find-similar",
  description: "Finds similar domains/pages from a source URL.",
  inputSchema: z.object({
    url: z.string(),
    numResults: z.number(),
    excludeSourceDomain: z.boolean(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string().optional(),
        url: z.string(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    void context;
    const result = await exa.findSimilar(inputData.url, {
      numResults: inputData.numResults,
      excludeSourceDomain: inputData.excludeSourceDomain,
    });
    return {
      results: result.results.map((item) => ({
        title: item.title ?? undefined,
        url: item.url,
      })),
    };
  },
});

export const exaSearchAndContentsTool = createTool({
  id: "exa-search-contents",
  description: "Searches and returns content excerpts.",
  inputSchema: z.object({
    query: z.string(),
    numResults: z.number(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        title: z.string().optional(),
        url: z.string(),
        text: z.string().optional(),
      }),
    ),
  }),
  execute: async (inputData, context) => {
    void context;
    const result = await exa.searchAndContents(inputData.query, {
      numResults: inputData.numResults,
      text: true,
    });
    return {
      results: result.results.map((item) => ({
        title: item.title ?? undefined,
        url: item.url,
        text: item.text ?? undefined,
      })),
    };
  },
});

export const exaResearchTool = createTool({
  id: "exa-research",
  description: "Runs deeper Exa research for a company or topic.",
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    result: z.any(),
  }),
  execute: async (inputData, context) => {
    void context;
    const result = await (exa as any).research(inputData.query);
    return { result };
  },
});
