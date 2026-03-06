# Worker Operations Runbook

This runbook covers post-cutover operations when dedicated service execution is enabled.

## Start/Stop

- Start:
  - `npm run worker:nest`
- Health probe:
  - `GET /health`
- Runtime status:
  - `GET /status`
- Stop gracefully:
  - send `SIGTERM`/`SIGINT`, process drains and exits.

## Ownership and Emergency Fallback

- Service-owned mode:
  - `WORKER_EXECUTION_OWNER=service`
  - Trigger API skips app-owned worker kicks (advisory-only log event).
- Emergency fallback to app-owned mode:
  - set `WORKER_EXECUTION_OWNER=app`
  - app trigger route resumes best-effort kick behavior.

## Monitoring and Alerts

Track from `/settings/ops`, queue metrics APIs, Nest service `/status`, and service heartbeat logs.

Set alert thresholds:

- Queue depth growth:
  - `pipelineQueueDepth` continuously increasing for 10+ minutes.
  - `stageQueueDepth` or `sendQueueDepth` increasing without matching throughput.
- Stuck jobs:
  - `stuckStageJobs > 0` for 5+ minutes.
  - `stuckSendJobs > 0` for 5+ minutes.
- Failure/retry spikes:
  - rising `stageFailed` or `sendFailed`.

## Recovery Steps

1. Scan:
   - `GET /api/ops/stuck-jobs`
2. Recover:
   - `POST /api/ops/stuck-jobs/recover`
3. Dynamic kick:
   - `POST /api/ops/scale-kick` (use dry run first)
4. If persistent, shift ownership to `app` temporarily and investigate service logs.

## App Cron Endpoints Policy

Keep app cron endpoints deployed for manual/emergency recovery only:

- `/api/cron/pipeline-worker`
- `/api/cron/stage-worker`
- `/api/cron/send-worker`

Do not use them as primary scheduler targets when `WORKER_EXECUTION_OWNER=service`.

