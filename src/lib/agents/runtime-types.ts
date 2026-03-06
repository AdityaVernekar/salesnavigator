export type ManagedAgentType =
  | "lead_gen"
  | "people_gen"
  | "enrichment"
  | "scoring"
  | "cold_email"
  | "followup";

export type NativeToolKey =
  | "exa.search"
  | "exa.find_similar"
  | "exa.search_contents"
  | "exa.research"
  | "clado.search_people"
  | "clado.deep_research"
  | "clado.get_profile"
  | "clado.enrich_contact"
  | "clado.scrape_linkedin_profile"
  | "clado.get_post_reactions"
  | "gmail.send"
  | "gmail.read"
  | "slack.notify";

export type ToolProvider = "native" | "mcp";

export type RuntimeGuardrails = {
  prependInstructions: string[];
  blockedPatterns: string[];
  maxPromptChars: number | null;
};

export type ResolvedRuntimeConfig = {
  source: "static" | "db";
  configVersionId: string | null;
  model: string;
  instructions: string;
  temperature: number;
  maxTokens: number;
  enabledToolKeys: string[];
  rejectedToolKeys: string[];
  promptVars: Record<string, unknown>;
  toolConfigs: Record<string, unknown>;
  guardrails: RuntimeGuardrails;
};
