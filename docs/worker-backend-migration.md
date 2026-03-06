# Dedicated Worker Backend Migration

This document is the execution checklist for migrating pipeline execution ownership from app-triggered cron endpoints to the dedicated worker service.

## Runtime Contract

- Queue keys and job contracts stay unchanged:
  - `pipeline:jobs:v1`
  - `pipeline:stage-jobs:v1`
  - `pipeline:send-jobs:v1`
- Existing DB tables and status transitions stay unchanged:
  - `pipeline_runs`
  - `stage_jobs`
  - `send_jobs`
  - `run_logs`
- Existing UI paths remain unchanged:
  - `/runs`
  - `/settings/ops`

## Required Environment

- Existing variables remain required (`SUPABASE_*`, `UPSTASH_*`, `CRON_SECRET`, API keys).
- New ownership/service variables:
  - `WORKER_EXECUTION_OWNER=app|service`
  - `WORKER_SERVICE_POLL_MS` (default `3000`)
  - `WORKER_SERVICE_HEARTBEAT_MS` (default `30000`)

## Staging Validation (Parity Suite)

1. Start dedicated NestJS worker backend in staging:
   - `npm run worker:nest`
2. Keep ownership as `app` first to validate idempotency and no regressions.
3. Trigger custom and full pipeline runs from UI.
4. Validate lifecycle parity:
   - runs move `queued -> running -> completed|failed`
   - stage dependency gating still blocks downstream work until upstream is done
   - send throttling and suppression behavior is unchanged
5. Validate logs/observability parity:
   - `/runs` still streams events via SSE
   - tools/errors/agent events visible as before
6. Validate stuck-job operations:
   - run `/api/ops/stuck-jobs` scan
   - run `/api/ops/stuck-jobs/recover` on a small dry run
7. Validate owner status API:
   - `GET /api/ops/execution-owner`

## Production Big-Bang Cutover

1. Deploy worker service in idle-ready mode.
2. Confirm service health:
   - `GET http://localhost:${WORKER_BACKEND_PORT:-4010}/health`
   - `GET http://localhost:${WORKER_BACKEND_PORT:-4010}/status`
3. Flip ownership:
   - set `WORKER_EXECUTION_OWNER=service`
4. Disable external scheduler hits to app cron worker endpoints.
5. Keep service running continuously:
   - `npm run worker:nest`
6. Monitor 30-60 minutes:
   - queue depth trends
   - stuck jobs
   - failed/retry spikes
   - run completion times
7. Rollback (config-only):
   - set `WORKER_EXECUTION_OWNER=app`
   - re-enable scheduler hits to app cron endpoints if needed

