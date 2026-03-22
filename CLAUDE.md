# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev                    # Next.js dev server (port 3000)
npm run worker:nest:dev        # NestJS worker with nodemon (port 4010)

# Build & Production
npm run build                  # Build Next.js for production
npm run start                  # Run production Next.js server
npm run worker:nest            # Start NestJS worker service

# Lint
npm run lint                   # ESLint

# Tests
npm run test:e2e-smoke         # Smoke tests against deployed app
npm run test:agent-runtime-smoke  # Agent config validation

# Docker
docker compose up --build      # Run both web + worker locally
```

## Architecture

**AI sales automation platform** with a multi-agent pipeline for lead generation, enrichment, scoring, and outreach.

### Two-Process Model
- **Web** (Next.js 16, port 3000): App Router frontend + 53 API routes
- **Worker** (NestJS, port 4010): Dedicated job processing service that polls Redis queues

Set `WORKER_EXECUTION_OWNER=service` in production for dedicated worker mode.

### Core Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, shadcn/ui (`components.json` style: "new-york")
- **Backend**: Next.js App Router API routes (`src/app/api/`)
- **Database**: Supabase PostgreSQL with Row-Level Security for multi-tenancy
- **Queue/Cache**: Redis via ioredis
- **Agent Framework**: Mastra v1.9 for TypeScript-native AI workflows
- **External APIs**: Composio (Gmail), Exa (web search), Clado (enrichment)

### Path Alias
`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### Multi-Agent Pipeline (`src/lib/mastra/workflows/`)
Five sequential stages, each backed by a configurable AI agent:
1. **Lead Generation** — Exa + Clado find companies matching ICP
2. **People Generation** — Clado finds decision-makers
3. **Enrichment** — Deep company/person profiling
4. **Scoring** — Claude evaluates ICP fit
5. **Email & Follow-up** — Composio + Gmail for outreach

Agent configurations are stored in Supabase and built at runtime (`src/lib/agents/build-runtime-agent.ts`), allowing prompt/tool changes without redeployment.

### Job Queue System (`src/lib/pipeline/`)
- Three queue types: pipeline, stage, send
- Jobs persisted in Supabase with lease/heartbeat mechanism
- Worker polls Redis, processes jobs, updates state
- Key files: `worker.ts`, `stage-worker.ts`, `send-worker.ts`, `queue.ts`, `job-store.ts`

### Multi-Tenancy
- All data scoped by `company_id`
- Supabase RLS policies enforce isolation (see `supabase/migrations/017_multi_tenant_rls.sql`)
- Auth middleware in `middleware.ts` validates session + company membership
- `src/lib/auth/route-context.ts` extracts user/company from API requests

### Auth Flow
- Supabase Auth with cookie-based sessions
- Public paths: `/login`, `/auth/callback`, `/auth/set-password`, `/auth/onboarding`, `/api/cron/*`, `/api/gmail/callback`
- Users without company membership are redirected to onboarding

### Database Migrations
Located in `supabase/migrations/`. Key migrations:
- `001_init.sql` — core schema
- `016_multi_tenant_companies.sql` — multi-tenancy tables
- `017_multi_tenant_rls.sql` — RLS policies

### Worker Backend (`apps/worker-backend/`)
Separate NestJS service with its own `tsconfig.worker.json`. Health/status endpoints at `/health` and `/status`.

### Key Directories
- `src/app/api/` — API routes (auth, pipeline, leads, campaigns, inbox, cron, ops)
- `src/components/` — React components organized by domain + `ui/` for shadcn
- `src/lib/agents/` — Dynamic agent configuration & runtime building
- `src/lib/pipeline/` — Job queue, workers, capacity management
- `src/lib/mastra/` — Mastra tools, workflows, and schemas
- `src/lib/supabase/` — DB client helpers (server.ts, client.ts)
- `src/lib/composio/` — Gmail integration via Composio
- `src/lib/email/` — Templating, routing, A/B experiments
- `scripts/` — Worker service scripts and smoke tests
