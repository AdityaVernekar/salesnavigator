# Deployment Notes

## Application

- Deploy Next.js app to Vercel (or Railway).
- Set all variables from `.env.example`.
- Ensure `NEXT_PUBLIC_APP_URL` points to the deployed app URL.

## Supabase

- Run migration `supabase/migrations/001_init.sql`.
- Set `SUPABASE_SERVICE_ROLE_KEY` in hosting environment.

## Cron Triggers

- Deploy workers from `cloudflare-workers/`.
- Each worker sends `POST` to `/api/cron/*` with `x-cron-secret`.
- Use same `CRON_SECRET` in both app and workers.

## Smoke Test

After deploy:

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.com npm run test:e2e-smoke
```
