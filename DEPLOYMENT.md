# Deployment Notes

## Application

- Deploy Next.js app to Vercel (or Railway).
- Set all variables from `.env.example`.
- Ensure `NEXT_PUBLIC_APP_URL` points to the deployed app URL.

## Supabase

- Run migration `supabase/migrations/001_init.sql`.
- Set `SUPABASE_SERVICE_ROLE_KEY` in hosting environment.

## Worker Scheduling

- Run the dedicated worker service with `npm run worker:nest`.
- Set `WORKER_EXECUTION_OWNER=service` in production.
- Keep app cron endpoints (`/api/cron/*`) available for manual or emergency operations only.
- If an external scheduler is used, call cron routes with `x-cron-secret` and the same `CRON_SECRET`.

## Smoke Test

After deploy:

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.com npm run test:e2e-smoke
```
