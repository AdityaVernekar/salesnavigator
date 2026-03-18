# SalesNav AI — Multi-Agent Sales Automation Platform

> **Purpose:** Replace the entire outbound sales team with autonomous AI agents.  
> **Mode:** Internal tool — users connect Gmail accounts, create campaigns, and agents handle everything from lead gen to closing replies.  
> **Status:** Building on existing Next.js 16 + Supabase foundation with Mastra agent framework.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Framework Decisions](#2-framework-decisions)
3. [System Architecture](#3-system-architecture)
4. [The Agent Pipeline](#4-the-agent-pipeline)
5. [External Service Integration](#5-external-service-integration)
6. [Gmail Multi-Account via Composio](#6-gmail-multi-account-via-composio)
7. [Supabase Schema](#7-supabase-schema)
8. [Agent Specifications](#8-agent-specifications)
9. [Email Warmup Engine](#9-email-warmup-engine)
10. [Campaign System](#10-campaign-system)
11. [API Routes](#11-api-routes)
12. [UI Pages & Components](#12-ui-pages--components)
13. [Worker Scheduling](#13-worker-scheduling)
14. [Project Structure](#14-project-structure)
15. [Environment Variables](#15-environment-variables)
16. [Build Phases](#16-build-phases)

---

## 1. Product Vision

### What This Is

A fully autonomous sales machine. A user logs in, connects their Gmail accounts, defines an Ideal Customer Profile (ICP), and the system does the rest:

```
User creates campaign
        ↓
   [Lead Gen Agent]         ← Exa + Clado find matching companies & contacts
        ↓
   [Enrichment Agent]       ← Clado profiles + Exa signals → contact briefs
        ↓
   [Scoring Agent]          ← Claude scores against ICP rubric
        ↓
   [Cold Email Agent]       ← Claude writes personalized emails → Composio sends via Gmail
        ↓
   [Follow-Up Agent]        ← Classifies replies, sends follow-ups, manages sequences
        ↓
   Hot leads surfaced in dashboard → human closes the deal
```

### Core User Flow

1. **Connect Gmail** — User connects 1+ Gmail accounts via Composio OAuth (supports multiple accounts for volume and warmup)
2. **Create Campaign** — Define ICP (industry, roles, geography, company size, signals), set scoring criteria, configure email sequence
3. **Agents Run on Autopilot** — Pipeline triggers on cron schedule (or manually). Agents find leads, enrich, score, email, and follow up
4. **Review & Close** — User sees scored leads in a tabular UI, monitors email performance, handles hot replies

### What Makes This Different

- **No SaaS dependency** — We own the entire pipeline, not a series of Zapier steps
- **AI-native scoring** — Claude reasons about ICP fit, not keyword matching
- **Multi-account warmup** — Agents warm up new Gmail accounts before sending real outreach
- **Fully configurable** — Every agent's system prompt, tools, and behavior are editable from the UI

---

## 2. Framework Decisions

### Agent Framework: Mastra

We are using **[Mastra](https://mastra.ai)** — a TypeScript-native framework purpose-built for AI agents and workflows.

**Why Mastra over custom or LangChain/CrewAI:**

| Consideration | LangChain / CrewAI | Raw custom code | Mastra |
|---|---|---|---|
| **TypeScript** | Python-first or heavy adapters | Full TS but you build everything | TypeScript-native, Zod schemas everywhere |
| **Agent model** | Framework-specific patterns | Build your own tool loop | `Agent` class with built-in tool-use loop, structured output, model routing |
| **Workflow engine** | No built-in orchestration | Build your own DAG runner | Graph-based workflows: `.then()`, `.branch()`, `.parallel()`, `.foreach()` |
| **Tools** | Various tool formats | Raw JSON Schema | `createTool()` with Zod input/output schemas — type-safe end to end |
| **Model routing** | Provider-specific imports | Manual adapter switching | One interface, 40+ providers (`anthropic/claude-sonnet-4-20250514`, `openai/gpt-4o`, etc.) |
| **Multi-agent** | CrewAI crews / LangGraph | Manual orchestration | Supervisor pattern + agent networks built in |
| **Suspend/Resume** | Not supported | Not supported | Built-in — pause workflows for human approval, resume later |
| **Next.js integration** | Bolted on | Native but manual wiring | First-class — runs inside API routes, agents callable from frontend |
| **Overhead** | 50+ packages (LangChain) | Zero deps but zero features | Focused: `@mastra/core` + `zod` |

**What Mastra gives us for this project:**

1. **5 Agents** — Each defined with `new Agent({ id, instructions, model, tools })`. Mastra handles the tool-use loop, model routing, and structured output extraction
2. **Pipeline Workflow** — `createWorkflow()` with `.then()` chains our 5 agents sequentially. `.branch()` routes scored leads to different email strategies. `.foreach()` processes leads in batches with concurrency control
3. **Type-safe Tools** — Every Exa, Clado, and Gmail tool defined with `createTool()` + Zod schemas. The agent sees the schema, the tool validates input/output at runtime
4. **Model flexibility** — Switch any agent between `anthropic/claude-sonnet-4-20250514` and `openai/gpt-4o` with a single string change. No adapter code needed
5. **Structured output** — Scoring agent returns typed JSON matching a Zod schema. No regex parsing or JSON extraction hacks

**Architecture with Mastra:**

```
Mastra instance (registered agents + workflows + tools)
    ↓
salesPipelineWorkflow (createWorkflow)
    .then(leadGenStep)          ← calls leadGenAgent.generate()
    .then(enrichmentStep)       ← calls enrichmentAgent.generate() per lead
    .then(scoringStep)          ← calls scoringAgent.generate() with structuredOutput
    .branch([
      [score >= hot,  hotEmailStep],     ← calls coldEmailAgent for hot leads
      [score >= warm, warmEmailStep],    ← calls coldEmailAgent for warm leads
      [else,          discardStep],      ← skip cold/DQ leads
    ])
    .commit()
    ↓
followUpWorkflow (separate, runs on cron)
    .then(pollRepliesStep)
    .foreach(classifyReplyStep)
    .then(sendDueFollowupsStep)
    .commit()
```

### Full Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Agent Framework** | Mastra (`@mastra/core`) | TypeScript-native agents, workflows, tools, model routing — built for exactly this |
| **Framework** | Next.js 16 (App Router) | API routes + UI in one repo. Already set up |
| **Language** | TypeScript 5 | Type safety across agents, tools, and DB |
| **Database** | Supabase (Postgres) | Free tier, instant REST, realtime subscriptions, built-in auth |
| **Auth** | Supabase Auth | Internal tool — magic link or email/password |
| **LLM (primary)** | Anthropic Claude (`anthropic/claude-sonnet-4-20250514`) | Best tool-use, best reasoning for scoring/writing |
| **LLM (fallback)** | OpenAI GPT-4o (`openai/gpt-4o`) | One-line model swap via Mastra's model routing |
| **Lead Discovery** | Exa API (`exa-js` SDK) | Neural web search, company signals, `findSimilar` for lookalike prospecting |
| **People Search** | Clado API (`search.clado.ai`) | Natural language LinkedIn search, deep research with 105 AI agents, email enrichment |
| **Gmail Integration** | Composio (`@composio/core`) | OAuth for multiple Gmail accounts, send/read/label — no raw `googleapis` wrangling |
| **UI Components** | shadcn/ui + Tailwind CSS v4 | Ship fast, looks good, accessible |
| **Data Fetching** | TanStack Query | Server state sync, caching, optimistic updates |
| **Cron Scheduling** | Dedicated backend worker service + optional external scheduler | Service-owned execution with cron endpoints available for manual/emergency triggers |
| **Queue (Phase 2)** | AWS ElastiCache Redis + BullMQ | Retries, concurrency limits, dead-letter queues for production scale |
| **Encryption** | `node:crypto` AES-256-GCM | OAuth tokens encrypted at rest in Supabase |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Next.js 16 App                                  │
│                                                                          │
│   UI (React 19)                   API Routes (/api/*)                    │
│   ├── /dashboard                  ├── /api/pipeline/trigger              │
│   ├── /leads (tabular scoring)    ├── /api/agents/run                    │
│   ├── /campaigns                  ├── /api/campaigns/*                   │
│   ├── /settings                   ├── /api/gmail/connect (Composio)      │
│   │   ├── Gmail Accounts          ├── /api/gmail/callback                │
│   │   └── Agent Configs           ├── /api/cron/*                        │
│   └── /inbox                      └── /api/leads                         │
│                                                                          │
│   mastra/                                                                │
│   ├── index.ts                   ← Mastra instance (agents + workflows)  │
│   ├── agents/                    ← 5 Mastra Agent definitions            │
│   ├── tools/                     ← createTool() for Exa, Clado, Gmail    │
│   └── workflows/                 ← Pipeline + follow-up workflows        │
│   lib/                                                                   │
│   ├── composio/                  ← Composio session + Gmail helpers      │
│   └── crypto.ts                  ← Token encryption                      │
│                                                                          │
└───────────────┬──────────────────────────┬───────────────────────────────┘
                │                          │
                ▼                          ▼
┌───────────────────────────┐  ┌──────────────────────────────┐
│   Supabase (Postgres)      │  │ Dedicated Worker Backend      │
│                            │  │                               │
│   • leads                  │  │ `npm run worker:nest`         │
│   • contacts               │  │ polls queue + executes jobs   │
│   • icp_scores             │  │                               │
│   • campaigns              │  │ Optional external scheduler    │
│   • email_accounts         │  │ can hit `/api/cron/*` with    │
│   • emails_sent            │  │ `x-cron-secret` for fallback  │
│   • enrollments            │  │                               │
│   • agent_configs          │  │ Ownership switch:             │
│   • pipeline_runs          │  │ `WORKER_EXECUTION_OWNER`      │
│   • run_logs               │  │ = `service | app`             │
│   • suppressions           │  └──────────────────────────────┘
│   • warmup_logs            │
└───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────┐
│                    External APIs                               │
│                                                               │
│   Exa (exa-js SDK)         Clado (REST)       Composio        │
│   ├── search()             ├── /search         ├── Gmail Send  │
│   ├── findSimilar()        ├── /deep_research  ├── Gmail Read  │
│   ├── searchAndContents()  ├── /enrich/contacts├── Gmail Label │
│   └── research()           ├── /scrape         └── OAuth Flow  │
│                            └── /profile                        │
│                                                               │
│   Anthropic Claude         OpenAI (fallback)   Slack (notify)  │
│   └── Tool-use loops       └── Tool-use loops  └── Webhooks   │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. The Agent Pipeline (Mastra Workflows)

### Sales Pipeline Workflow

The core pipeline is a Mastra workflow that chains agents as steps. Each step calls an agent via `.generate()` with structured output, writes results to Supabase, and passes data to the next step.

```typescript
// mastra/workflows/sales-pipeline.ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const salesPipelineWorkflow = createWorkflow({
  id: "sales-pipeline",
  description: "Full sales pipeline: lead gen → enrich → score → email",
  inputSchema: z.object({
    campaignId: z.string(),
    runId: z.string(),
  }),
  outputSchema: z.object({
    leadsGenerated: z.number(),
    leadsEnriched: z.number(),
    leadsScored: z.number(),
    emailsSent: z.number(),
  }),
})
  .then(leadGenStep)        // Agent finds leads via Exa + Clado → saves to DB
  .then(enrichmentStep)     // Agent enriches each lead via Clado → saves contacts
  .then(scoringStep)        // Agent scores contacts with structured output → saves scores
  .then(emailStep)          // Agent writes + sends emails for hot/warm leads
  .commit();
```

### Step Definitions

Each workflow step wraps a Mastra agent call:

```typescript
// Step 1: Lead Generation
const leadGenStep = createStep({
  id: "lead-gen",
  inputSchema: z.object({ campaignId: z.string(), runId: z.string() }),
  outputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("leadGenAgent");
    const campaign = await loadCampaign(inputData.campaignId);

    const result = await agent.generate(
      `Find ${campaign.leads_per_run} leads matching this ICP: ${JSON.stringify(campaign)}`,
      { structuredOutput: { schema: leadsOutputSchema } }
    );

    const leads = result.object.leads;
    await saveLeadsToDb(leads, inputData.campaignId, inputData.runId);

    return { ...inputData, leadsGenerated: leads.length };
  },
});

// Step 2: Enrichment (processes each lead)
const enrichmentStep = createStep({
  id: "enrichment",
  inputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number() }),
  outputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number(), leadsEnriched: z.number() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("enrichmentAgent");
    const leads = await getNewLeads(inputData.campaignId);

    const result = await agent.generate(
      `Enrich these leads: ${JSON.stringify(leads)}`,
      { structuredOutput: { schema: contactsOutputSchema } }
    );

    await saveContactsToDb(result.object.contacts, inputData.campaignId);
    return { ...inputData, leadsEnriched: result.object.contacts.length };
  },
});

// Step 3: Scoring (structured output with Zod schema)
const scoringStep = createStep({
  id: "scoring",
  inputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number(), leadsEnriched: z.number() }),
  outputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number(), leadsEnriched: z.number(), leadsScored: z.number() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("scoringAgent");
    const campaign = await loadCampaign(inputData.campaignId);
    const contacts = await getEnrichedContacts(inputData.campaignId);

    const result = await agent.generate(
      `Score these contacts against ICP rubric: ${JSON.stringify({ contacts, rubric: campaign.scoring_rubric })}`,
      { structuredOutput: { schema: scoresOutputSchema } }
    );

    await saveScoresToDb(result.object.scores, inputData.campaignId);
    return { ...inputData, leadsScored: result.object.scores.length };
  },
});

// Step 4: Cold Email (sends to hot + warm leads)
const emailStep = createStep({
  id: "cold-email",
  inputSchema: z.object({ campaignId: z.string(), runId: z.string(), leadsGenerated: z.number(), leadsEnriched: z.number(), leadsScored: z.number() }),
  outputSchema: z.object({ leadsGenerated: z.number(), leadsEnriched: z.number(), leadsScored: z.number(), emailsSent: z.number() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("coldEmailAgent");
    const hotWarmContacts = await getHotWarmContacts(inputData.campaignId);

    const result = await agent.generate(
      `Write and send personalized emails to these contacts: ${JSON.stringify(hotWarmContacts)}`,
      { structuredOutput: { schema: emailsOutputSchema } }
    );

    await saveEmailsToDb(result.object.emails, inputData.campaignId);
    return { leadsGenerated: inputData.leadsGenerated, leadsEnriched: inputData.leadsEnriched, leadsScored: inputData.leadsScored, emailsSent: result.object.emails.filter(e => e.sent).length };
  },
});
```

### Follow-Up Workflow (separate, runs on cron)

```typescript
// mastra/workflows/follow-up.ts
export const followUpWorkflow = createWorkflow({
  id: "follow-up",
  description: "Poll replies, classify, send due follow-ups",
  inputSchema: z.object({ campaignIds: z.array(z.string()) }),
  outputSchema: z.object({ repliesProcessed: z.number(), followupsSent: z.number() }),
})
  .then(pollRepliesStep)
  .then(sendDueFollowupsStep)
  .commit();
```

### Mastra Instance Registration

```typescript
// mastra/index.ts
import { Mastra } from "@mastra/core/mastra";
import { leadGenAgent, enrichmentAgent, scoringAgent, coldEmailAgent, followUpAgent } from "./agents";
import { salesPipelineWorkflow } from "./workflows/sales-pipeline";
import { followUpWorkflow } from "./workflows/follow-up";

export const mastra = new Mastra({
  agents: { leadGenAgent, enrichmentAgent, scoringAgent, coldEmailAgent, followUpAgent },
  workflows: { salesPipelineWorkflow, followUpWorkflow },
});
```

### Running the Pipeline

```typescript
// From an API route or cron handler:
const workflow = mastra.getWorkflow("salesPipelineWorkflow");
const run = await workflow.createRun();

const result = await run.start({
  inputData: { campaignId: "campaign-uuid", runId: "run-uuid" },
});

if (result.status === "success") {
  console.log(result.result); // { leadsGenerated, leadsEnriched, leadsScored, emailsSent }
}
```

### Data Flow Between Agents

Each agent reads from and writes to Supabase within its workflow step. The database is the source of truth. This allows:
- Rerunning any individual agent independently (call `agent.generate()` directly)
- Manual intervention at any stage (pause, edit, skip)
- Full auditability via `run_logs` table
- Streaming workflow progress via Mastra's `run.stream()` for real-time UI updates

---

## 5. External Service Integration

### Exa API (Lead Discovery + Company Intelligence)

**SDK:** `exa-js` (npm package)

**Endpoints used:**

| Method | Purpose | When Used |
|---|---|---|
| `exa.search()` | Find companies matching ICP signals (funding, hiring, product launches) | Lead Gen agent |
| `exa.findSimilar()` | Given a URL of an ideal customer, find lookalike companies | Lead Gen agent |
| `exa.searchAndContents()` | Search + get page content in one call (for company news) | Enrichment agent |
| `exa.research()` | Deep agentic research on a company (structured output) | Enrichment agent (hot leads only) |

**Tool definitions (Mastra `createTool()` with Zod):**

```typescript
// mastra/tools/exa.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY!);

export const exaSearchTool = createTool({
  id: "exa-search",
  description: "Search the web for companies, news, funding announcements, job postings matching the ICP.",
  inputSchema: z.object({
    query: z.string().describe("Natural language search query"),
    numResults: z.number().default(10),
    type: z.enum(["auto", "neural", "keyword"]).default("auto"),
    category: z.enum(["company", "news", "tweet", "research paper"]).optional(),
    startPublishedDate: z.string().optional().describe("ISO date, e.g. 2025-01-01"),
    includeDomains: z.array(z.string()).optional(),
    excludeDomains: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      text: z.string().optional(),
    })),
  }),
  execute: async (input) => {
    const results = await exa.search(input.query, {
      numResults: input.numResults,
      type: input.type,
      category: input.category,
      startPublishedDate: input.startPublishedDate,
      includeDomains: input.includeDomains,
      excludeDomains: input.excludeDomains,
    });
    return { results: results.results };
  },
});

export const exaFindSimilarTool = createTool({
  id: "exa-find-similar",
  description: "Find companies similar to a given URL. Powers lookalike prospecting.",
  inputSchema: z.object({
    url: z.string(),
    numResults: z.number().default(10),
    excludeSourceDomain: z.boolean().default(true),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      text: z.string().optional(),
    })),
  }),
  execute: async (input) => {
    const results = await exa.findSimilar(input.url, {
      numResults: input.numResults,
      excludeSourceDomain: input.excludeSourceDomain,
    });
    return { results: results.results };
  },
});
```

### Clado API (People Search + Contact Enrichment)

**Base URL:** `https://search.clado.ai`  
**Auth:** Bearer token (`lk_...` prefix)

**Endpoints used:**

| Endpoint | Method | Purpose | Credits |
|---|---|---|---|
| `/api/search` | GET | Natural language LinkedIn search with AI filtering | 1/result |
| `/api/search/deep_research` | POST | Async deep research with 105 AI agents | 1/validated profile |
| `/api/search/deep_research/status` | GET | Poll deep research job status | Free |
| `/api/enrich/contacts` | GET | Get verified email + phone for a LinkedIn profile | 4 (email) / 10 (phone) |
| `/api/scrape` | GET | Full LinkedIn profile scrape | 1 |
| `/api/profile` | GET | Cached LinkedIn profile data | 1 |

**Tool definitions (Mastra `createTool()` with Zod):**

```typescript
// mastra/tools/clado.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const CLADO_BASE = "https://search.clado.ai";
const cladoHeaders = () => ({ Authorization: `Bearer ${process.env.CLADO_API_KEY}` });

export const cladoSearchPeopleTool = createTool({
  id: "clado-search-people",
  description: "Search 800M+ LinkedIn profiles using natural language. Returns name, headline, company, LinkedIn URL.",
  inputSchema: z.object({
    query: z.string().describe("Natural language query, e.g. 'VP of Engineering at Series B SaaS companies in SF'"),
    limit: z.number().default(25).describe("Max results"),
    agent_filter: z.boolean().default(true).describe("Enable AI quality filtering"),
    search_id: z.string().optional().describe("Pagination: reuse search_id from previous results"),
    offset: z.number().optional().describe("Pagination: skip N results"),
  }),
  outputSchema: z.object({ profiles: z.array(z.any()), search_id: z.string().optional() }),
  execute: async (input) => {
    const url = new URL(`${CLADO_BASE}/api/search`);
    url.searchParams.set("query", input.query);
    url.searchParams.set("limit", String(input.limit));
    if (input.agent_filter) url.searchParams.set("agent_filter", "true");
    if (input.search_id) url.searchParams.set("search_id", input.search_id);
    if (input.offset) url.searchParams.set("offset", String(input.offset));
    const res = await fetch(url, { headers: cladoHeaders() });
    return res.json();
  },
});

export const cladoDeepResearchTool = createTool({
  id: "clado-deep-research",
  description: "Start async deep research with 105 AI agents for complex queries. Auto-polls for completion.",
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().default(30),
    hard_filter_company_urls: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ profiles: z.array(z.any()), status: z.string() }),
  execute: async (input) => {
    const res = await fetch(`${CLADO_BASE}/api/search/deep_research`, {
      method: "POST",
      headers: { ...cladoHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const { job_id } = await res.json();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 10_000));
      const statusRes = await fetch(
        `${CLADO_BASE}/api/search/deep_research/status?job_id=${job_id}`,
        { headers: cladoHeaders() }
      );
      const status = await statusRes.json();
      if (status.status === "completed") return status;
      if (status.status === "failed") throw new Error(`Deep research failed`);
    }
    throw new Error("Deep research timed out");
  },
});

export const cladoEnrichContactTool = createTool({
  id: "clado-enrich-contact",
  description: "Get verified email and optional phone for a LinkedIn profile. 4 credits for email, 10 for phone.",
  inputSchema: z.object({
    linkedin_url: z.string(),
    email_enrichment: z.boolean().default(true),
    phone_enrichment: z.boolean().default(false),
  }),
  outputSchema: z.object({ data: z.array(z.any()) }),
  execute: async (input) => {
    const url = new URL(`${CLADO_BASE}/api/enrich/contacts`);
    url.searchParams.set("linkedin_url", input.linkedin_url);
    if (input.email_enrichment) url.searchParams.set("email_enrichment", "true");
    if (input.phone_enrichment) url.searchParams.set("phone_enrichment", "true");
    const res = await fetch(url, { headers: cladoHeaders() });
    return res.json();
  },
});

export const cladoGetProfileTool = createTool({
  id: "clado-get-profile",
  description: "Get full LinkedIn profile data: work history, education, skills, headline.",
  inputSchema: z.object({ linkedin_url: z.string() }),
  outputSchema: z.object({ profile: z.any() }),
  execute: async (input) => {
    const url = new URL(`${CLADO_BASE}/api/profile`);
    url.searchParams.set("linkedin_url", input.linkedin_url);
    const res = await fetch(url, { headers: cladoHeaders() });
    return res.json();
  },
});
```

**Note:** All Clado API logic (HTTP calls, polling, error handling) is self-contained inside each `createTool()` execute function above. No separate "client" file needed — Mastra tools are the integration layer.

---

## 6. Gmail Multi-Account via Composio

### Why Composio Instead of Raw googleapis

| Concern | Raw googleapis | Composio |
|---|---|---|
| OAuth flow | Build consent screen, handle tokens, refresh, store | One-line `session.tools()` — Composio manages OAuth lifecycle |
| Multi-account | Manual per-account token storage and rotation | Each user_id is a Composio session — add accounts by creating connected accounts |
| Token refresh | Manual refresh_token → access_token logic, handle expiry | Automatic — Composio handles token refresh transparently |
| Send/Read/Label | Build raw MIME messages, manage Gmail API pagination | Pre-built Gmail toolkit with send, read, search, label tools |
| Agent integration | Convert Gmail API responses to tool results manually | `session.tools()` returns agent-ready tool definitions |

### Composio Setup

```typescript
// lib/composio/client.ts
import { Composio } from "@composio/core";

const composio = new Composio();

// Each Gmail account = a Composio connected account under a user_id
export async function getGmailTools(userId: string) {
  const session = await composio.create(userId);
  const tools = await session.tools({ toolkits: ["gmail"] });
  return tools;
}

// Initiate OAuth for a new Gmail account
export async function connectGmailAccount(userId: string) {
  const session = await composio.create(userId);
  // Returns an OAuth URL the user clicks to authorize
  return session.initiateConnection({ toolkit: "gmail" });
}
```

### Multi-Account Strategy

Each Gmail account the user connects gets a unique Composio `user_id` (we use our `email_accounts.id`). When sending:

1. **Account selection** — Pick the account with the fewest sends today that hasn't hit its daily limit
2. **Send via Composio** — Use the Gmail tools from that account's session
3. **Track sends** — Increment `sends_today`, log to `emails_sent`

```typescript
// lib/email/router.ts
export async function selectSendingAccount(campaignId: string): Promise<EmailAccount> {
  const campaign = await getCampaign(campaignId);

  const accounts = await db.from("email_accounts")
    .select("*")
    .in("id", campaign.account_ids)
    .eq("is_active", true)
    .lt("sends_today", db.raw("daily_limit"))
    .order("sends_today", { ascending: true })
    .limit(1)
    .single();

  if (!accounts.data) throw new Error("No available sending accounts — all at daily limit");
  return accounts.data;
}

export async function sendViaComposio(accountId: string, to: string, subject: string, bodyHtml: string) {
  const tools = await getGmailTools(accountId);

  // Use the gmail_send tool from Composio
  const result = await tools.execute({
    name: "GMAIL_SEND_EMAIL",
    arguments: { to, subject, body: bodyHtml, content_type: "text/html" },
  });

  // Track the send
  await db.from("email_accounts")
    .update({ sends_today: db.raw("sends_today + 1") })
    .eq("id", accountId);

  return result;
}
```

### Gmail Tools Available via Composio

| Tool | Purpose | Agent |
|---|---|---|
| `GMAIL_SEND_EMAIL` | Send email (HTML/text, threading) | Cold Email, Follow-Up, Warmup |
| `GMAIL_GET_MESSAGES` | Read inbox messages with filters | Follow-Up |
| `GMAIL_GET_THREAD` | Get full email thread for reply context | Follow-Up |
| `GMAIL_MODIFY_MESSAGE` | Add/remove labels (Primary, Promotions) | Warmup |
| `GMAIL_GET_PROFILE` | Get Gmail address of connected account | Setup |

---

## 7. Supabase Schema

```sql
-- ═══════════════════════════════════════════════════════
-- AGENT CONFIGURATIONS
-- ═══════════════════════════════════════════════════════
create table agent_configs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('lead_gen','enrichment','scoring','cold_email','followup')),
  system_prompt   text not null,
  model           text not null default 'claude-sonnet-4-20250514',
  provider        text not null default 'anthropic',
  temperature     float not null default 0.3,
  max_tokens      int not null default 4096,
  tools_enabled   text[] default '{}',
  tool_configs    jsonb default '{}',
  prompt_vars     jsonb default '{}',
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- CAMPAIGNS
-- ═══════════════════════════════════════════════════════
create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  status            text default 'draft' check (status in ('draft','active','paused','completed')),
  
  -- ICP Definition (what the lead gen agent searches for)
  icp_description   text not null,
  target_industries text[] default '{}',
  target_roles      text[] default '{}',
  geography         text,
  company_size      text,
  company_signals   text,
  exclude_domains   text[] default '{}',
  leads_per_run     int default 20,
  
  -- Scoring Criteria
  scoring_rubric    text,
  hot_threshold     int default 75,
  warm_threshold    int default 50,
  disqualify_signals text,
  
  -- Email Config
  account_ids       uuid[] default '{}',          -- Gmail accounts to use
  persona_name      text,
  persona_title     text,
  persona_company   text,
  value_prop        text,
  tone              text default 'professional',
  cta_type          text,
  cta_link          text,
  
  -- Sequence
  sequence_steps    jsonb default '[]',
  daily_send_limit  int default 50,
  
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- sequence_steps JSON structure:
-- [
--   {
--     "step": 1, "delay_days": 0,
--     "subject_template": "Quick question about {{company_name}}",
--     "body_template": "Hi {{first_name}}, ...",
--     "ai_personalize": true
--   },
--   {
--     "step": 2, "delay_days": 3,
--     "subject_template": "Re: {{previous_subject}}",
--     "body_template": "Following up on my previous email...",
--     "ai_personalize": true
--   }
-- ]

-- ═══════════════════════════════════════════════════════
-- GMAIL ACCOUNTS (connected via Composio)
-- ═══════════════════════════════════════════════════════
create table email_accounts (
  id                uuid primary key default gen_random_uuid(),
  gmail_address     text not null unique,
  display_name      text,
  composio_user_id  text not null,                 -- Composio session user_id
  warmup_status     text default 'new'
                    check (warmup_status in ('new','warming','graduated','paused')),
  warmup_start_date date,
  daily_limit       int default 50,
  sends_today       int default 0,
  last_reset_at     date default current_date,
  is_active         boolean default true,
  created_at        timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- RAW LEADS (output of Lead Gen Agent)
-- ═══════════════════════════════════════════════════════
create table leads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns(id) on delete cascade,
  source          text not null check (source in ('exa','clado','manual')),
  company_name    text,
  company_domain  text,
  linkedin_url    text,
  exa_url         text,
  raw_data        jsonb default '{}',
  status          text not null default 'new'
                  check (status in ('new','enriching','enriched','scored','emailed','disqualified','error')),
  pipeline_run_id uuid,
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- ENRICHED CONTACTS (output of Enrichment Agent)
-- ═══════════════════════════════════════════════════════
create table contacts (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references leads(id) on delete cascade,
  campaign_id         uuid references campaigns(id),
  name                text,
  first_name          text,
  email               text,
  email_verified      boolean default false,
  phone               text,
  linkedin_url        text,
  headline            text,
  company_name        text,
  clado_profile       jsonb default '{}',
  exa_company_signals jsonb default '{}',
  contact_brief       text,                         -- Claude-written personalization brief
  enriched_at         timestamptz,
  created_at          timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- ICP SCORES (output of Scoring Agent — shown in tabular UI)
-- ═══════════════════════════════════════════════════════
create table icp_scores (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid references contacts(id) on delete cascade,
  campaign_id         uuid references campaigns(id),
  score               int not null,                 -- 0-100
  tier                text not null check (tier in ('hot','warm','cold','disqualified')),
  reasoning           text,
  positive_signals    jsonb default '[]',            -- string[]
  negative_signals    jsonb default '[]',            -- string[]
  recommended_angle   text,
  next_action         text check (next_action in ('email','manual_review','discard')),
  scored_at           timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- SEQUENCE ENROLLMENTS (per-contact progress through email sequence)
-- ═══════════════════════════════════════════════════════
create table enrollments (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  account_id      uuid references email_accounts(id),  -- which Gmail sent it
  current_step    int default 0,
  status          text default 'active'
                  check (status in ('active','paused','completed','unsubscribed','bounced','replied')),
  gmail_thread_id text,
  next_step_at    timestamptz,
  enrolled_at     timestamptz default now(),
  unique(campaign_id, contact_id)
);

-- ═══════════════════════════════════════════════════════
-- EMAILS SENT LOG
-- ═══════════════════════════════════════════════════════
create table emails_sent (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid references enrollments(id) on delete cascade,
  account_id      uuid references email_accounts(id),
  step_number     int,
  to_email        text,
  subject         text,
  body_html       text,
  sent_at         timestamptz default now(),
  opened_at       timestamptz,
  replied_at      timestamptz,
  bounced         boolean default false,
  classification  text                              -- INTERESTED, NOT_INTERESTED, etc.
);

-- ═══════════════════════════════════════════════════════
-- PIPELINE RUNS (execution history)
-- ═══════════════════════════════════════════════════════
create table pipeline_runs (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns(id),
  trigger         text default 'manual' check (trigger in ('manual','cron','webhook')),
  status          text default 'running' check (status in ('running','completed','failed','cancelled')),
  current_stage   text,                             -- which agent is currently running
  leads_generated int default 0,
  leads_enriched  int default 0,
  leads_scored    int default 0,
  emails_sent     int default 0,
  started_at      timestamptz default now(),
  finished_at     timestamptz,
  error           text
);

-- ═══════════════════════════════════════════════════════
-- RUN LOGS (streamed to dashboard in real-time)
-- ═══════════════════════════════════════════════════════
create table run_logs (
  id          bigint primary key generated always as identity,
  run_id      uuid references pipeline_runs(id) on delete cascade,
  agent_type  text,
  level       text default 'info' check (level in ('info','warn','error','success')),
  message     text,
  metadata    jsonb default '{}',
  ts          timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- WARMUP LOGS
-- ═══════════════════════════════════════════════════════
create table warmup_logs (
  id                bigint primary key generated always as identity,
  from_account_id   uuid references email_accounts(id),
  to_account_id     uuid references email_accounts(id),
  direction         text check (direction in ('sent','replied','opened')),
  sent_at           timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- GLOBAL SUPPRESSION LIST
-- ═══════════════════════════════════════════════════════
create table suppressions (
  id       uuid primary key default gen_random_uuid(),
  email    text unique,
  reason   text,
  added_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════
create index on leads(campaign_id, status);
create index on leads(pipeline_run_id);
create index on contacts(lead_id);
create index on contacts(campaign_id);
create index on contacts(email);
create index on icp_scores(contact_id);
create index on icp_scores(campaign_id, tier);
create index on enrollments(status, next_step_at);
create index on enrollments(campaign_id);
create index on emails_sent(enrollment_id);
create index on run_logs(run_id);
create index on warmup_logs(from_account_id, sent_at);

-- ═══════════════════════════════════════════════════════
-- RLS: disabled for internal single-user tool
-- ═══════════════════════════════════════════════════════
alter table agent_configs   disable row level security;
alter table campaigns       disable row level security;
alter table email_accounts  disable row level security;
alter table leads           disable row level security;
alter table contacts        disable row level security;
alter table icp_scores      disable row level security;
alter table enrollments     disable row level security;
alter table emails_sent     disable row level security;
alter table pipeline_runs   disable row level security;
alter table run_logs        disable row level security;
alter table warmup_logs     disable row level security;
alter table suppressions    disable row level security;

-- ═══════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════
create or replace function increment_sends_today(p_account_id uuid)
returns void as $$
  update email_accounts
  set sends_today = sends_today + 1
  where id = p_account_id;
$$ language sql;

create or replace function reset_daily_sends()
returns void as $$
  update email_accounts
  set sends_today = 0, last_reset_at = current_date
  where last_reset_at < current_date;
$$ language sql;

-- Enable Supabase Realtime on run_logs for live streaming
alter publication supabase_realtime add table run_logs;
```

---

## 8. Agent Specifications (Mastra Agent Class)

All agents are defined using Mastra's `Agent` class. Each agent gets its `instructions`, a `model` string (Mastra routes to the right provider), and `tools` — Mastra `createTool()` definitions that the agent can call autonomously.

### Agent Definitions

```typescript
// mastra/agents/index.ts
import { Agent } from "@mastra/core/agent";
import { exaSearchTool, exaFindSimilarTool, exaSearchAndContentsTool } from "../tools/exa";
import {
  cladoSearchPeopleTool,
  cladoDeepResearchTool,
  cladoEnrichContactTool,
  cladoGetProfileTool,
} from "../tools/clado";
import { gmailSendTool, gmailReadTool } from "../tools/gmail";
import { slackNotifyTool } from "../tools/slack";

// ── Agent 1: Lead Generation ────────────────────────────
export const leadGenAgent = new Agent({
  id: "lead-gen-agent",
  name: "Lead Generation Agent",
  description: "Finds B2B leads matching an ICP definition using Exa web search and Clado LinkedIn search.",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {
    exaSearchTool,
    exaFindSimilarTool,
    cladoSearchPeopleTool,
    cladoDeepResearchTool,
  },
  instructions: `You are a B2B lead generation agent.

STRATEGY:
1. Use exaSearchTool with type "auto" to find companies matching the ICP signals.
   Search for funding announcements, job postings, executive hires, product launches.
2. Use cladoSearchPeopleTool to find contacts matching target roles at those companies.
   Always set agent_filter=true for quality filtering.
3. For highly specific or niche searches, use cladoDeepResearchTool.
4. If you find a great-fit company URL, use exaFindSimilarTool to find lookalikes.
5. Deduplicate: skip any domain in the exclude list.
6. Stop when you have the requested number of leads.

Always return structured JSON with an array of leads.`,
});

// ── Agent 2: Enrichment ─────────────────────────────────
export const enrichmentAgent = new Agent({
  id: "enrichment-agent",
  name: "Enrichment Agent",
  description: "Gathers full LinkedIn profiles, verified emails, and company signals for raw leads.",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {
    cladoGetProfileTool,
    cladoEnrichContactTool,
    exaSearchTool: exaSearchAndContentsTool,
  },
  instructions: `You are an enrichment agent. For each lead, gather full profile data and verified contact info.

FOR EACH LEAD:
1. Call cladoGetProfileTool with LinkedIn URL → full profile (work history, skills, headline)
2. Call cladoEnrichContactTool with LinkedIn URL → verified email address
3. Call exaSearchTool with the company name → recent news, funding, product signals (last 30 days)
4. Synthesize a 3-sentence contact_brief:
   - Who is this person and what's their likely mandate?
   - What recent company signal is most relevant to our value prop?
   - What angle should the outreach email take?

SKIP RULES:
- Skip if no verified email is found
- Skip if email is already in the suppression list`,
});

// ── Agent 3: Scoring (ICP Qualification) ────────────────
export const scoringAgent = new Agent({
  id: "scoring-agent",
  name: "Scoring Agent",
  description: "Scores enriched contacts against an ICP rubric. Returns score, tier, reasoning, and signals.",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {},
  instructions: `You are an ICP scoring agent. Score each enriched contact against the provided rubric.

RULES:
- Be decisive. Every contact must receive a score (0-100) and tier (hot/warm/cold/disqualified).
- If data is incomplete, score conservatively.
- Explain your reasoning clearly — this is shown to the user in a table.
- List specific positive and negative signals from the profile and company data.
- Recommend a personalization angle for the email agent.
- next_action: "email" for hot/warm, "manual_review" for borderline, "discard" for cold/DQ.`,
});

// ── Agent 4: Cold Email ─────────────────────────────────
export const coldEmailAgent = new Agent({
  id: "cold-email-agent",
  name: "Cold Email Agent",
  description: "Writes highly personalized cold emails and sends them via Gmail.",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {
    gmailSendTool,
    exaSearchTool,
  },
  instructions: `You are an expert cold email writer and sender.

EMAIL RULES:
- Length: 80-150 words max
- First line must reference something specific about the contact or company
- NEVER start with "I hope this finds you" or "My name is"
- NEVER use generic phrases like "I noticed your company" without specifics
- Use the contact_brief and recommended_angle from the scoring agent

FOR EACH CONTACT:
1. Read the contact_brief and recommended_angle
2. Write a personalized subject line and email body
3. Call gmailSendTool to send the email`,
});

// ── Agent 5: Follow-Up ──────────────────────────────────
export const followUpAgent = new Agent({
  id: "follow-up-agent",
  name: "Follow-Up Agent",
  description: "Classifies inbox replies and sends due follow-up emails in sequences.",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {
    gmailReadTool,
    gmailSendTool,
    slackNotifyTool,
  },
  instructions: `You are a follow-up and inbox management agent.

JOB 1 — CLASSIFY REPLIES:
Call gmailReadTool to fetch new replies across active enrollment threads.
For each reply, classify it:
- INTERESTED: positive signals, wants to learn more or book a call
- NOT_INTERESTED: explicit rejection
- OUT_OF_OFFICE: auto-reply with return date
- NEEDS_INFO: has a question
- BOUNCED: delivery failure
- UNSUBSCRIBE: opt-out

Actions:
- INTERESTED → stop sequence, notify Slack with contact details
- NOT_INTERESTED → stop sequence
- OUT_OF_OFFICE → pause until return date + 2 days
- NEEDS_INFO → notify Slack, draft suggested reply (don't auto-send)
- BOUNCED → stop sequence, mark email as invalid
- UNSUBSCRIBE → add to suppression list, stop all sequences

JOB 2 — SEND DUE FOLLOW-UPS:
For each due step, write a follow-up referencing the previous thread,
and send via gmailSendTool using the SAME account that sent the original.`,
});
```

### Structured Output Schemas (used by workflow steps)

```typescript
// mastra/schemas/index.ts
import { z } from "zod";

export const leadsOutputSchema = z.object({
  leads: z.array(z.object({
    company_name: z.string(),
    company_domain: z.string(),
    linkedin_url: z.string().nullable(),
    exa_url: z.string().nullable(),
    source: z.enum(["exa", "clado"]),
    raw_data: z.any(),
  })),
});

export const contactsOutputSchema = z.object({
  contacts: z.array(z.object({
    lead_id: z.string(),
    name: z.string(),
    first_name: z.string(),
    email: z.string(),
    email_verified: z.boolean(),
    phone: z.string().nullable(),
    linkedin_url: z.string(),
    headline: z.string(),
    company_name: z.string(),
    clado_profile: z.any(),
    exa_company_signals: z.any(),
    contact_brief: z.string(),
  })),
});

export const scoresOutputSchema = z.object({
  scores: z.array(z.object({
    contact_id: z.string(),
    score: z.number().min(0).max(100),
    tier: z.enum(["hot", "warm", "cold", "disqualified"]),
    reasoning: z.string(),
    positive_signals: z.array(z.string()),
    negative_signals: z.array(z.string()),
    recommended_angle: z.string(),
    next_action: z.enum(["email", "manual_review", "discard"]),
  })),
});

export const emailsOutputSchema = z.object({
  emails: z.array(z.object({
    contact_id: z.string(),
    subject: z.string(),
    body_html: z.string(),
    sent: z.boolean(),
    gmail_thread_id: z.string().nullable(),
  })),
});
```

### Dynamic Instructions (per-campaign)

Agent instructions are enriched at runtime inside the workflow step's `execute` function. Campaign-specific context is injected into the prompt:

```typescript
// Inside the workflow step execute function:
const campaign = await loadCampaign(campaignId);

const result = await agent.generate(
  `ICP DEFINITION:\n${campaign.icp_description}\n\n` +
  `TARGET CRITERIA:\n- Industries: ${campaign.target_industries.join(", ")}\n` +
  `- Roles: ${campaign.target_roles.join(", ")}\n` +
  `- Geography: ${campaign.geography}\n` +
  `- Company size: ${campaign.company_size}\n` +
  `- Signals: ${campaign.company_signals}\n` +
  `- Exclude domains: ${campaign.exclude_domains.join(", ")}\n\n` +
  `Find ${campaign.leads_per_run} leads.`,
  { structuredOutput: { schema: leadsOutputSchema } }
);
```

This pattern keeps agent definitions generic and reusable while injecting campaign context at runtime.

---

## 9. Email Warmup Engine

### Why Warmup is Critical

New Gmail accounts sending 50+ cold emails/day immediately will land in spam. The warmup engine gradually builds sender reputation over 14-30 days.

### How It Works

1. Account A sends a natural-sounding email to Account B (both in our warmup pool)
2. Account B's agent auto-opens it, moves it to Primary inbox, and replies naturally
3. This builds positive engagement signals for both accounts
4. Daily volume ramps up on a schedule
5. Once graduated, the account enters the live cold email sending pool

### Warmup Schedule

```
Day 1-3:    5 warmup emails/day
Day 4-7:    15 warmup emails/day
Day 8-14:   30 warmup emails/day
Day 15-21:  50 warmup emails/day
Day 22-30:  Maintain 50/day, monitor bounce/spam rates
Day 31+:    Graduated → enters live sending pool
```

### Graduation Criteria

An account graduates when ALL conditions are met:
- 21+ days of warmup completed
- Bounce rate < 2% over last 7 days
- No spam reports
- Successfully sent 50+ emails/day for 7 consecutive days

### Warmup Content Generation

Claude generates warmup emails at temperature 0.9 — professional but mundane. Never salesy.

```typescript
// lib/warmup/content.ts
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

const warmupAgent = new Agent({
  id: "warmup-content-agent",
  name: "Warmup Content Agent",
  model: "anthropic/claude-sonnet-4-20250514",
  tools: {},
  instructions: `Generate a short, natural business email between colleagues.
    Never write anything salesy. Topics: meeting follow-ups, project updates,
    quick questions, scheduling, sharing resources.
    Length: 30-80 words. Vary tone: formal to casual.`,
});

const warmupEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export async function generateWarmupEmail(): Promise<{ subject: string; body: string }> {
  const result = await warmupAgent.generate("Generate one warmup email.", {
    structuredOutput: { schema: warmupEmailSchema },
  });
  return result.object;
}
```

### Warmup Cron (runs every hour)

```typescript
// Triggered by Cloudflare Worker → /api/cron/warmup
export async function runWarmupCycle() {
  const warmingAccounts = await db.from("email_accounts")
    .select("*")
    .eq("warmup_status", "warming")
    .eq("is_active", true);

  for (const account of warmingAccounts.data ?? []) {
    const daysIn = daysSince(account.warmup_start_date);
    const targetSends = getWarmupTarget(daysIn);

    // Check graduation
    if (shouldGraduate(account, daysIn)) {
      await db.from("email_accounts")
        .update({ warmup_status: "graduated" })
        .eq("id", account.id);
      continue;
    }

    // Pick random partner accounts to exchange warmup emails with
    const partners = await getWarmupPartners(account.id, targetSends);
    for (const partner of partners) {
      const content = await generateWarmupEmail();
      await sendViaComposio(account.id, partner.gmail_address, content.subject, content.body);

      await db.from("warmup_logs").insert({
        from_account_id: account.id,
        to_account_id: partner.id,
        direction: "sent",
      });
    }
  }
}
```

---

## 10. Campaign System

### Campaign Creation Flow (UI)

**Step 1 — Define ICP**
```
┌──────────────────────────────────────────────────────────────┐
│  CREATE CAMPAIGN                                              │
│                                                              │
│  Campaign Name: [Enterprise SaaS Outreach Q1        ]        │
│                                                              │
│  ICP DESCRIPTION (natural language):                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Series A-C B2B SaaS companies with 50-500 employees │    │
│  │ that recently raised funding or are hiring for       │    │
│  │ sales/marketing roles. Based in US, UK, or EU.       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Target Industries: [SaaS] [Fintech] [+ Add]                │
│  Target Roles:      [VP Sales] [Head of Growth] [+ Add]     │
│  Geography:         [United States, United Kingdom     ]     │
│  Company Size:      [50-500 employees                  ]     │
│  Signals:           [Recent funding, hiring sales reps ]     │
│  Exclude Domains:   [competitor.com] [+ Add]                 │
│  Leads per Run:     [20                                ]     │
│                                                              │
│  [Next: Scoring Criteria →]                                  │
└──────────────────────────────────────────────────────────────┘
```

**Step 2 — Scoring Criteria**
```
┌──────────────────────────────────────────────────────────────┐
│  SCORING CRITERIA                                            │
│                                                              │
│  Scoring Rubric (what makes a lead "hot"):                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ +20: Decision maker (VP/C-level/Director)            │    │
│  │ +15: Company raised funding in last 6 months         │    │
│  │ +15: Hiring for our-relevant roles                   │    │
│  │ +10: Company size 100-300 employees                  │    │
│  │ +10: Based in target geography                       │    │
│  │ -20: Competitor company                              │    │
│  │ -15: Individual contributor (not decision maker)     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Hot Threshold:   [75  ] (score ≥ 75 → auto-email)          │
│  Warm Threshold:  [50  ] (score 50-74 → auto-email)         │
│                                                              │
│  Disqualify if:   [Competitor, agency, student      ]        │
│                                                              │
│  [← Back]  [Next: Email Sequence →]                         │
└──────────────────────────────────────────────────────────────┘
```

**Step 3 — Email Sequence**
```
┌──────────────────────────────────────────────────────────────┐
│  EMAIL SEQUENCE                                              │
│                                                              │
│  Sender Persona:                                             │
│  Name:    [Alex Chen          ]                              │
│  Title:   [Head of Partnerships]                             │
│  Company: [SalesNav AI         ]                             │
│                                                              │
│  Value Prop:                                                 │
│  [We help B2B companies automate outbound sales...     ]     │
│                                                              │
│  Gmail Accounts:                                             │
│  ☑ alex@outreach.salesnav.com (Graduated, 12/50 today)      │
│  ☑ alex@hello.salesnav.io    (Graduated, 8/50 today)        │
│  ☐ new@warmup.salesnav.com   (Warming — Day 8/30)           │
│                                                              │
│  SEQUENCE STEPS:                                             │
│  ┌─ Step 1 (Day 0) ──────────────────────────────────┐      │
│  │ Subject: Quick thought on {{company_name}}         │      │
│  │ Body:    [Template editor...]                      │      │
│  │ AI Personalize: ☑                                  │      │
│  └────────────────────────────────────────────────────┘      │
│  ┌─ Step 2 (Day 3) ──────────────────────────────────┐      │
│  │ Subject: Re: {{previous_subject}}                  │      │
│  │ Body:    [Follow-up template...]                   │      │
│  │ AI Personalize: ☑                                  │      │
│  └────────────────────────────────────────────────────┘      │
│  [+ Add Step]                                                │
│                                                              │
│  [← Back]  [Launch Campaign]                                 │
└──────────────────────────────────────────────────────────────┘
```

### Lead Scoring Tabular UI

The scoring agent's output is displayed in a rich table:

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  LEAD SCORES — Enterprise SaaS Outreach Q1                        [Filter ▼] [Export CSV]│
│                                                                                          │
│  ┌────┬───────────────┬──────────────┬───────┬──────┬─────────────────────┬──────────┐   │
│  │ #  │ Name          │ Company      │ Score │ Tier │ Key Signals         │ Action   │   │
│  ├────┼───────────────┼──────────────┼───────┼──────┼─────────────────────┼──────────┤   │
│  │ 1  │ Sarah Chen    │ Acme Corp    │  92   │ HOT  │ ✅ VP Sales          │ ✉ Queued │   │
│  │    │               │              │       │      │ ✅ Series B ($30M)   │          │   │
│  │    │               │              │       │      │ ✅ Hiring 5 AEs      │          │   │
│  ├────┼───────────────┼──────────────┼───────┼──────┼─────────────────────┼──────────┤   │
│  │ 2  │ James Liu     │ TechStart    │  78   │ HOT  │ ✅ Director Growth   │ ✉ Queued │   │
│  │    │               │              │       │      │ ✅ Series A          │          │   │
│  │    │               │              │       │      │ ⚠️ Small team (30)   │          │   │
│  ├────┼───────────────┼──────────────┼───────┼──────┼─────────────────────┼──────────┤   │
│  │ 3  │ Maria Garcia  │ DataFlow     │  61   │ WARM │ ✅ Head of Sales     │ ✉ Queued │   │
│  │    │               │              │       │      │ ❌ No recent funding │          │   │
│  ├────┼───────────────┼──────────────┼───────┼──────┼─────────────────────┼──────────┤   │
│  │ 4  │ Tom Wilson    │ Competitor   │   0   │ DQ   │ ❌ Competitor        │ Skipped  │   │
│  └────┴───────────────┴──────────────┴───────┴──────┴─────────────────────┴──────────┘   │
│                                                                                          │
│  Summary: 20 scored │ 8 Hot │ 7 Warm │ 3 Cold │ 2 Disqualified                          │
│  [▶ Send Emails to Hot+Warm]  [Review Warm Leads]  [Export All]                          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. API Routes

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/pipeline/trigger` | Start full pipeline run for a campaign |
| `POST` | `/api/agents/run` | Run a single agent (for testing) |
| `GET/POST` | `/api/campaigns` | List / create campaigns |
| `GET/PATCH` | `/api/campaigns/[id]` | Get / update campaign |
| `POST` | `/api/campaigns/[id]/launch` | Activate campaign |
| `GET` | `/api/leads` | Paginated lead list (filter: campaign, tier, status) |
| `GET` | `/api/leads/[id]` | Contact detail with scores |
| `GET` | `/api/gmail/connect` | Start Composio OAuth flow |
| `GET` | `/api/gmail/callback` | Composio OAuth callback |
| `GET` | `/api/gmail/accounts` | List connected Gmail accounts |
| `DELETE` | `/api/gmail/accounts/[id]` | Disconnect Gmail account |
| `POST` | `/api/cron/lead-gen` | CF Worker target — run lead gen |
| `POST` | `/api/cron/followup` | CF Worker target — run follow-up |
| `POST` | `/api/cron/warmup` | CF Worker target — run warmup cycle |
| `POST` | `/api/cron/reset-sends` | CF Worker target — reset daily counters |
| `POST` | `/api/cron/sequence-step` | CF Worker target — send due sequence steps |
| `GET` | `/api/run-logs/[runId]` | SSE stream of run logs |
| `GET/PATCH` | `/api/agent-configs` | List / update agent configurations |
| `GET` | `/api/inbox` | Reply list with classifications |
| `POST` | `/api/inbox/[id]/classify` | Manual classification override |

---

## 12. UI Pages & Components

### Page Map

| Route | Purpose | Key Components |
|---|---|---|
| `/` | Dashboard — pipeline stats, active runs, quick actions | StatCards, RunList, RunNow button |
| `/leads` | Lead database with scoring table | LeadsTable (sortable, filterable), ScoreBadge, SignalChips |
| `/leads/[id]` | Contact detail — profile, scores, email history | ContactDrawer, ScoreCard, EmailTimeline |
| `/campaigns` | Campaign list | CampaignCard, StatusBadge |
| `/campaigns/new` | Campaign creation wizard (3 steps) | IcpForm, ScoringForm, SequenceBuilder |
| `/campaigns/[id]` | Campaign detail — enrolled contacts, email stats | EnrollmentTable, EmailStats |
| `/settings` | Gmail accounts + agent configs | GmailAccountCard, WarmupProgress |
| `/settings/agents/[type]` | Agent config editor — system prompt, vars | PromptEditor, VarTable |
| `/inbox` | Reply inbox — classified replies, actions | ReplyList, ClassificationBadge, ActionButtons |

### Key Components

**LeadsTable** — The core scoring display
- Columns: Name, Company, Score (color-coded), Tier badge, Key Signals, Status, Actions
- Expandable rows for full reasoning and contact brief
- Filters: campaign, tier (hot/warm/cold/DQ), status, date range
- Bulk actions: send emails, export CSV, disqualify

**GmailAccountCard** — Per-account status
- Gmail address, warmup status badge, sends today / daily limit
- Warmup progress bar (Day X/30)
- Connect / disconnect / pause warmup actions

**RunLogStream** — Real-time agent activity
- Supabase Realtime subscription on `run_logs` table
- Color-coded by level (info/warn/error/success)
- Shows agent type, message, tool calls, latency

---

## 13. Worker Scheduling

Primary execution runs in the dedicated backend worker service. Cron routes remain available for manual or emergency triggers with `x-cron-secret`.

| Job | Suggested Schedule | Target Route | Purpose |
|---|---|---|---|
| `lead-gen` | `0 9 * * 1-5` (9am weekdays) | `/api/cron/lead-gen` | Run lead gen for active campaigns |
| `followup` | `*/15 * * * *` (every 15 min) | `/api/cron/followup` | Check replies + send due follow-ups |
| `sequence` | `*/30 * * * *` (every 30 min) | `/api/cron/sequence-step` | Send due sequence steps |
| `warmup` | `0 * * * *` (every hour) | `/api/cron/warmup` | Run warmup email cycle |
| `reset-sends` | `0 0 * * *` (midnight UTC) | `/api/cron/reset-sends` | Reset daily send counters |

Use:
- `WORKER_EXECUTION_OWNER=service` for production ownership.
- `WORKER_EXECUTION_OWNER=app` as emergency fallback.

---

## 14. Project Structure

```
salesnav/
├── src/
│   ├── mastra/                                # ◆ Mastra framework layer
│   │   ├── index.ts                           # Mastra instance — registers agents + workflows
│   │   │
│   │   ├── agents/                            # Mastra Agent definitions
│   │   │   ├── index.ts                       # Re-exports all 5 agents
│   │   │   ├── lead-gen.ts                    # leadGenAgent
│   │   │   ├── enrichment.ts                  # enrichmentAgent
│   │   │   ├── scoring.ts                     # scoringAgent
│   │   │   ├── cold-email.ts                  # coldEmailAgent
│   │   │   └── follow-up.ts                   # followUpAgent
│   │   │
│   │   ├── tools/                             # Mastra createTool() definitions
│   │   │   ├── exa.ts                         # exaSearchTool, exaFindSimilarTool, etc.
│   │   │   ├── clado.ts                       # cladoSearchPeopleTool, cladoEnrichContactTool, etc.
│   │   │   ├── gmail.ts                       # gmailSendTool, gmailReadTool (via Composio)
│   │   │   └── slack.ts                       # slackNotifyTool
│   │   │
│   │   ├── workflows/                         # Mastra createWorkflow() definitions
│   │   │   ├── sales-pipeline.ts              # Main pipeline: lead-gen → enrich → score → email
│   │   │   └── follow-up.ts                   # Follow-up: poll replies → classify → send due
│   │   │
│   │   └── schemas/                           # Zod schemas for structured output
│   │       └── index.ts                       # leadsOutputSchema, contactsOutputSchema, etc.
│   │
│   ├── app/
│   │   ├── layout.tsx                         # Root layout + sidebar nav
│   │   ├── page.tsx                           # Dashboard
│   │   ├── globals.css
│   │   ├── leads/
│   │   │   ├── page.tsx                       # Lead scoring table
│   │   │   └── [id]/page.tsx                  # Contact detail
│   │   ├── campaigns/
│   │   │   ├── page.tsx                       # Campaign list
│   │   │   ├── new/page.tsx                   # Campaign creation wizard
│   │   │   └── [id]/page.tsx                  # Campaign detail
│   │   ├── settings/
│   │   │   ├── page.tsx                       # Gmail accounts + general
│   │   │   └── agents/
│   │   │       └── [type]/page.tsx            # Agent config editor
│   │   ├── inbox/
│   │   │   └── page.tsx                       # Reply inbox
│   │   └── api/
│   │       ├── pipeline/
│   │       │   └── trigger/route.ts           # Triggers salesPipelineWorkflow
│   │       ├── agents/
│   │       │   └── run/route.ts               # Run a single agent (testing)
│   │       ├── campaigns/
│   │       │   ├── route.ts                   # GET/POST
│   │       │   └── [id]/
│   │       │       ├── route.ts               # GET/PATCH
│   │       │       └── launch/route.ts
│   │       ├── gmail/
│   │       │   ├── connect/route.ts           # Composio OAuth start
│   │       │   ├── callback/route.ts          # Composio OAuth callback
│   │       │   └── accounts/route.ts          # List accounts
│   │       ├── leads/
│   │       │   ├── route.ts                   # GET (paginated)
│   │       │   └── [id]/route.ts
│   │       ├── inbox/
│   │       │   ├── route.ts
│   │       │   └── [id]/classify/route.ts
│   │       ├── cron/
│   │       │   ├── lead-gen/route.ts
│   │       │   ├── followup/route.ts
│   │       │   ├── warmup/route.ts
│   │       │   ├── reset-sends/route.ts
│   │       │   └── sequence-step/route.ts
│   │       ├── agent-configs/
│   │       │   └── route.ts
│   │       └── run-logs/
│   │           └── [runId]/route.ts           # SSE stream
│   │
│   ├── lib/
│   │   ├── composio/
│   │   │   ├── client.ts                     # Composio client + session management
│   │   │   └── gmail.ts                      # Gmail-specific helpers
│   │   ├── supabase/
│   │   │   ├── client.ts                     # Browser client
│   │   │   └── server.ts                     # Server client (service role)
│   │   ├── warmup/
│   │   │   ├── engine.ts                     # WarmupEngine
│   │   │   └── content.ts                    # generateWarmupEmail() (uses Mastra Agent)
│   │   ├── email/
│   │   │   └── router.ts                     # Multi-account selection + send via Composio
│   │   ├── crypto.ts                         # AES-256-GCM encrypt/decrypt
│   │   └── config/
│   │       └── env.ts                        # Environment variables
│   │
│   └── components/
│       ├── ui/                               # shadcn/ui components
│       ├── leads/
│       │   ├── leads-table.tsx               # Main scoring table
│       │   ├── score-badge.tsx               # Color-coded score display
│       │   ├── signal-chips.tsx              # Positive/negative signal badges
│       │   └── contact-drawer.tsx            # Slide-out detail view
│       ├── campaigns/
│       │   ├── campaign-card.tsx
│       │   ├── icp-form.tsx                  # Step 1 of wizard
│       │   ├── scoring-form.tsx              # Step 2 of wizard
│       │   └── sequence-builder.tsx          # Step 3 of wizard
│       ├── gmail/
│       │   ├── gmail-account-card.tsx
│       │   └── warmup-progress.tsx
│       ├── pipeline/
│       │   ├── run-log-stream.tsx            # Supabase Realtime log viewer
│       │   └── stat-cards.tsx                # Dashboard stats
│       ├── inbox/
│       │   ├── reply-list.tsx
│       │   └── classification-badge.tsx
│       └── agents/
│           └── agent-config-form.tsx         # System prompt + vars editor
│
├── supabase/
│   └── migrations/
│       └── 001_init.sql                      # Full schema (exists, needs update)
│
├── .env.local
├── .env.example
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
└── eslint.config.mjs
```

---

## 15. Environment Variables

```bash
# ── Supabase ─────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── LLM Providers ───────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...                    # fallback provider
LITELLM_BASE_URL=http://...             # optional LiteLLM proxy
LITELLM_API_KEY=...                      # optional

# ── Lead Gen APIs ───────────────────────────────────
EXA_API_KEY=...
CLADO_API_KEY=lk_...

# ── Gmail via Composio ──────────────────────────────
COMPOSIO_API_KEY=...

# ── Security ────────────────────────────────────────
ENCRYPTION_MASTER_KEY=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>

# ── Optional ────────────────────────────────────────
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 16. Build Phases

### Phase 1 — Foundation (Days 1-2)

**Goal:** Mastra framework initialized, tools connected, one manual pipeline run

- [ ] Install dependencies:
  ```bash
  pnpm add @mastra/core@latest zod@^4 exa-js @composio/core @supabase/supabase-js
  pnpm add -D mastra@latest
  ```
- [ ] Run Supabase schema migration
- [ ] `lib/supabase/client.ts` + `lib/supabase/server.ts`
- [ ] `lib/crypto.ts` — AES-256-GCM encrypt/decrypt
- [ ] `src/mastra/tools/exa.ts` — Exa tools with `createTool()` (search, findSimilar, searchAndContents)
- [ ] `src/mastra/tools/clado.ts` — Clado tools with `createTool()` (search, deep research, enrich, profile)
- [ ] `src/mastra/agents/lead-gen.ts` — First Mastra Agent definition
- [ ] `src/mastra/index.ts` — Mastra instance with leadGenAgent registered
- [ ] `/api/pipeline/trigger` — Manual pipeline trigger (runs workflow)
- [ ] Test: trigger pipeline, verify leads appear in Supabase

### Phase 2 — All Five Agents + Pipeline Workflow (Days 2-3)

**Goal:** Full pipeline runs end-to-end via Mastra workflow

- [ ] `src/mastra/agents/enrichment.ts` — Test with one real lead
- [ ] `src/mastra/agents/scoring.ts` — Test with enriched contacts + structuredOutput
- [ ] `src/mastra/schemas/index.ts` — All Zod output schemas
- [ ] `lib/composio/client.ts` + `lib/composio/gmail.ts` — Composio setup
- [ ] `src/mastra/tools/gmail.ts` — Gmail tools via Composio wrapped in `createTool()`
- [ ] `/api/gmail/connect` + `/api/gmail/callback` — OAuth flow
- [ ] `src/mastra/agents/cold-email.ts` — Draft + send one real email
- [ ] `src/mastra/agents/follow-up.ts` — Reply classification
- [ ] `src/mastra/workflows/sales-pipeline.ts` — Wire all 5 steps with `.then()`
- [ ] `src/mastra/workflows/follow-up.ts` — Separate follow-up workflow
- [ ] Update `src/mastra/index.ts` — Register all agents + workflows
- [ ] End-to-end test: `workflow.createRun().start()` → leads scored + emails sent

### Phase 3 — UI (Days 3-5)

**Goal:** Full dashboard, campaign wizard, scoring table

- [ ] shadcn/ui setup + Tailwind config
- [ ] Root layout with sidebar nav
- [ ] `/` — Dashboard with stat cards and run list
- [ ] `/leads` — LeadsTable with scoring display (the main tabular UI)
- [ ] `/campaigns/new` — 3-step campaign wizard
- [ ] `/campaigns` — Campaign list
- [ ] `/settings` — Gmail account management + warmup status
- [ ] `/settings/agents/[type]` — Agent config editor
- [ ] `/inbox` — Reply inbox with classifications
- [ ] `RunLogStream` — Real-time log viewer using Supabase Realtime

### Phase 4 — Warmup + Crons (Days 5-6)

**Goal:** Autonomous operation — agents run on schedule, emails warm up

- [ ] `lib/warmup/engine.ts` + `lib/warmup/content.ts`
- [ ] `/api/cron/*` — All cron endpoint handlers
- [ ] Deploy dedicated worker backend service
- [ ] Configure scheduler targets for `/api/cron/*` as needed
- [ ] Warmup progress UI in `/settings`
- [ ] Multi-account round-robin in email sending

### Phase 5 — Polish & Scale (Days 6-7)

**Goal:** Production-ready internal tool

- [ ] Error handling across all agents (retries, dead-letter logging)
- [ ] Campaign pause/resume
- [ ] Bulk actions on leads table
- [ ] CSV export
- [ ] Suppression list management
- [ ] End-to-end integration test with all 5 agents + warmup
- [ ] Deploy web + worker backend + Supabase

---

## Decision Log

| Decision | Choice | Reasoning |
|---|---|---|
| Agent framework | **Mastra** (`@mastra/core`) | TypeScript-native, Zod-first tools, built-in workflow engine with `.then()/.branch()/.parallel()/.foreach()`, model routing across 40+ providers, structured output, suspend/resume — purpose-built for this |
| LLM | Claude Sonnet (primary) via Mastra model routing | Best tool-use and reasoning; Mastra handles provider routing with one string `"anthropic/claude-sonnet-4-20250514"` |
| Gmail integration | Composio | Handles OAuth lifecycle, multi-account, pre-built tools |
| Lead search | Exa + Clado | Exa for company signals, Clado for LinkedIn people search |
| Database | Supabase Postgres | Free tier, realtime, built-in auth, easy migrations |
| Crons | Dedicated backend worker service + optional external scheduler | Centralized execution ownership with simpler operations and rollback |
| UI | shadcn/ui + Tailwind | Fast to build, great defaults, accessible |
| Queue (Phase 2) | AWS ElastiCache Redis + BullMQ | Managed Redis, retries, concurrency — add when scaling |
| No LangChain | — | Python-first, 50+ deps, heavy abstraction not worth it for TypeScript project |
| No CrewAI | — | Too opinionated about agent collaboration patterns; Mastra workflows give us explicit control |
| No custom LLM client | — | Mastra's model routing replaces `SalesNavLLMClient` — same multi-provider support with less code |

---

*Five Mastra agents. One workflow. Full autopilot. Your sales team in a repo.*
