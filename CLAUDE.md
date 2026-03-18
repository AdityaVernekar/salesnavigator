# CLAUDE.md — SalesNav AI

## Project Overview

SalesNav AI is a multi-agent sales automation platform that replaces outbound sales teams with autonomous AI agents. It orchestrates lead generation, enrichment, scoring, email composition, and follow-up workflows.

**Architecture:** Next.js 16 web app + NestJS worker backend, deployed as a single Docker image running two services.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui (Radix UI), Lucide icons |
| State/Data | TanStack React Query 5, React Hook Form + Zod |
| Agent Framework | Mastra 1.9 (workflows, tools, memory) |
| Worker | NestJS 11 |
| Database | Supabase (PostgreSQL) with RLS, 21 migrations |
| Cache/Queue | Redis (ioredis) via AWS ElastiCache |
| Auth | Supabase Auth + SSR |
| AI Models | OpenAI (GPT), Anthropic (Claude) |
| External APIs | Exa (web search), Clado (people research), Composio (Gmail) |
| Deployment | Docker, AWS ECR + Lightsail, GitHub Actions CI/CD |

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # ~53 API routes (cron, auth, ops, pipeline)
│   ├── auth/               # Login, onboarding pages
│   ├── campaigns/          # Campaign management
│   ├── contacts/           # Contact management
│   ├── inbox/              # Email inbox
│   ├── leads/              # Lead management
│   ├── runs/               # Pipeline run monitoring
│   ├── settings/           # User settings
│   ├── layout.tsx          # Root layout with sidebar
│   └── page.tsx            # Dashboard
├── components/             # React components
│   ├── ui/                 # Base UI (shadcn/ui)
│   ├── agents/             # Agent configuration
│   ├── pipeline/           # Pipeline monitoring
│   ├── gmail/              # Gmail integration
│   ├── templates/          # Email templates
│   ├── campaigns/          # Campaign UI
│   ├── contacts/           # Contact UI
│   ├── inbox/              # Inbox UI
│   ├── leads/              # Lead UI
│   └── providers.tsx       # Context providers
├── lib/                    # Services & utilities
│   ├── config/env.ts       # Environment configuration (central source of truth)
│   ├── auth/               # Auth & multi-tenant membership
│   ├── supabase/           # Supabase clients (server, client, admin)
│   ├── redis/              # Redis client
│   ├── agents/             # Agent runtime, config, tool registry
│   ├── ai/                 # AI model selection
│   ├── warmup/             # Email warmup engine
│   └── utils.ts            # General utilities
├── mastra/                 # Mastra agent framework
│   ├── workflows/          # Agent workflows
│   │   ├── sales-pipeline.ts       # Main pipeline orchestration (largest file)
│   │   ├── sales-pipeline-stage.ts # Stage-specific workflows
│   │   └── follow-up.ts            # Reply classification & follow-up
│   ├── tools/              # External integrations (exa, clado, gmail, slack)
│   ├── schemas/            # Zod schemas for tools & workflows
│   ├── index.ts            # Mastra instance initialization
│   └── memory.ts           # In-memory storage config
apps/
└── worker-backend/         # NestJS worker service
    └── src/
        ├── main.ts                 # Bootstrap (port 4010)
        ├── app.module.ts           # Module definition
        ├── app.controller.ts       # Health/status endpoints
        └── worker-loop.service.ts  # Job processing loop
supabase/
└── migrations/             # 21 SQL migration files (001_init.sql → latest)
scripts/                    # Utility & smoke test scripts
docs/                       # Operational runbooks
```

## Commands

```bash
# Development
npm run dev                    # Start Next.js dev server
npm run build                  # Production build
npm run start                  # Production server
npm run lint                   # ESLint

# Worker
npm run worker:nest            # Start NestJS worker (port 4010)
npm run worker:nest:dev        # Worker with nodemon auto-reload

# Testing
npm run test:e2e-smoke         # Endpoint smoke tests
npm run test:agent-runtime-smoke  # Agent config validation
```

There is no Jest/Vitest setup. Testing is limited to smoke scripts.

## Architecture Patterns

### Multi-Tenant
- Company-based Row Level Security (RLS) in Supabase
- All queries scoped to the user's company via `src/lib/auth/membership.ts`

### Agent-First Design
- Mastra workflows define all AI behavior: lead gen → enrichment → scoring → email → follow-up
- Each agent's system prompt, tools, and guardrails are editable from the UI via database config
- Agent instantiation via `src/lib/agents/build-runtime-agent.ts` with guardrails
- Tool resolution via `src/lib/agents/tool-registry.ts`

### Job Processing
- Redis-backed job queue for pipeline stage execution
- Worker polls for jobs, acquires leases, sends heartbeats
- Configurable via `STAGE_JOB_LEASE_SECONDS`, `STAGE_JOB_TIMEOUT_SECONDS`, etc.

### Dual Execution Modes
- `PIPELINE_EXECUTION_MODE=legacy` — original pipeline
- `PIPELINE_EXECUTION_MODE=mastra` — new Mastra-based workflows
- `WORKER_EXECUTION_OWNER=app|service` — controls whether web or worker processes jobs

## Key Environment Variables

### Required
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Admin database access
- `SUPABASE_DB_POOLER_URL` — Connection pooling
- `NEXT_PUBLIC_APP_URL` — Application base URL
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — LLM inference
- `EXA_API_KEY` — Semantic search
- `CLADO_API_KEY` — People research
- `COMPOSIO_API_KEY` — Gmail integration
- `ENCRYPTION_MASTER_KEY` — Field encryption
- `CRON_SECRET` — Webhook secret for cron triggers

### Redis
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS_ENABLED`

### Worker Tuning
- `WORKER_BACKEND_PORT` (default: 4010)
- `WORKER_SERVICE_POLL_MS` (default: 3000)
- `STAGE_JOB_LEASE_SECONDS` (default: 150)
- `STAGE_JOB_TIMEOUT_SECONDS` (default: 900)

## Conventions

### Code Style
- TypeScript strict mode throughout
- Path aliases: `@/` maps to `src/`
- ESLint 9 flat config with Next.js rules
- shadcn/ui components in `src/components/ui/` (New York style)
- Zod schemas for all external data boundaries (API inputs, tool schemas)

### API Routes
- Located under `src/app/api/` using Next.js App Router conventions
- Cron endpoints protected by `CRON_SECRET` header validation
- Operations endpoints under `src/app/api/ops/`

### Database
- Migrations in `supabase/migrations/` numbered sequentially (001–021+)
- RLS policies enforce multi-tenant isolation
- All schema changes via migration files

### Auth Flow
- `middleware.ts` handles route protection and auth redirects
- Supabase Auth with SSR cookie management
- Protected routes redirect unauthenticated users to `/auth/login`

## Deployment

- **Docker:** Multi-stage Alpine build, single image for web + worker
- **CI/CD:** GitHub Actions on push to `main` → build → push to ECR → deploy via SSH to Lightsail
- **Web:** Port 3000 (`npm run start`)
- **Worker:** Port 4010 (`npm run worker:nest`)
- **Health checks:** `GET /health`, `GET /status`, `GET /api/ops/execution-owner`

## Important Files

| File | Purpose |
|------|---------|
| `src/mastra/workflows/sales-pipeline.ts` | Core pipeline orchestration (~59KB) |
| `src/lib/config/env.ts` | Central environment config |
| `src/lib/agents/build-runtime-agent.ts` | Agent instantiation with guardrails |
| `src/lib/agents/tool-registry.ts` | Available tools for agents |
| `middleware.ts` | Auth routing middleware |
| `prd.md` | Full product requirements document |
| `docs/worker-operations-runbook.md` | Worker ops guide |
