This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Dedicated Worker Service

- Start NestJS worker backend: `npm run worker:nest`
- Worker health URL: `http://localhost:4010/health`
- Worker status URL: `http://localhost:4010/status`
- Migration checklist: `docs/worker-backend-migration.md`
- Ops runbook: `docs/worker-operations-runbook.md`

## Docker

This repo runs as two processes in production:

- `web` (Next.js): `npm run start`
- `worker` (NestJS loop service): `npm run worker:nest`

### 1) Build image

```bash
set -a
source .env
set +a

docker build -t salesnav:local \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --build-arg SUPABASE_SERVICE_ROLE_KEY \
  --build-arg SUPABASE_DB_POOLER_URL \
  --build-arg REDIS_HOST \
  --build-arg REDIS_PORT \
  --build-arg REDIS_PASSWORD \
  --build-arg REDIS_TLS_ENABLED \
  --build-arg OPENAI_API_KEY \
  --build-arg ANTHROPIC_API_KEY \
  --build-arg EXA_API_KEY \
  --build-arg CLADO_API_KEY \
  --build-arg COMPOSIO_API_KEY \
  --build-arg ENCRYPTION_MASTER_KEY \
  --build-arg CRON_SECRET \
  .
```

### 2) Run containers directly

```bash
# Web app
docker run --rm --env-file .env -p 3000:3000 salesnav:local npm run start
```

```bash
# Worker backend
docker run --rm --env-file .env -p 4010:4010 salesnav:local npm run worker:nest
```

### 3) Run both with Docker Compose

```bash
docker compose up --build
```

`docker compose` reads build args from your local `.env` via variable substitution.

Service endpoints:

- Web: `http://localhost:3000`
- Worker health: `http://localhost:4010/health`
- Worker status: `http://localhost:4010/status`

## Cloud Deployment (Generic)

Deploy the same image as two services:

1. **Web service**
   - Command: `npm run start`
   - Port: `3000`
2. **Worker service**
   - Command: `npm run worker:nest`
   - Port: `4010` (can remain private/internal)

Set environment variables via your cloud provider's secret manager (do not bake `.env` into image).

Recommended production setting:

- `WORKER_EXECUTION_OWNER=service`

### Required environment groups

- Database:
  - `SUPABASE_DB_POOLER_URL` (or `SUPABASE_DB_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY`
- Supabase client:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Queue/cache:
  - `REDIS_HOST` (e.g. `master.sales-navy.g3u5fs.aps1.cache.amazonaws.com`)
  - `REDIS_PORT` (default `6379`)
  - `REDIS_PASSWORD` (optional)
  - `REDIS_TLS_ENABLED` (`true` for secure default)
- App/runtime:
  - `CRON_SECRET`
  - `ENCRYPTION_MASTER_KEY`
  - `PIPELINE_EXECUTION_MODE`
  - `WORKER_EXECUTION_OWNER`
  - `WORKER_SERVICE_POLL_MS`
  - `WORKER_SERVICE_HEARTBEAT_MS`
  - `WORKER_BACKEND_PORT` (defaults to `4010`)
- Model/provider keys as used in your deployment:
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `EXA_API_KEY`, `COMPOSIO_API_KEY`, `CLADO_API_KEY`, etc.

## Production Verification

After deployment:

1. Check web app is reachable.
2. Check worker endpoints:
   - `GET /health`
   - `GET /status`
3. Confirm ownership:
   - `GET /api/ops/execution-owner` reports `owner: "service"` when cutover is complete.
