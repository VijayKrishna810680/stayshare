# Deploying StayShare

StayShare is a Next.js 15 app (`output: "standalone"`) with PostgreSQL. Any Node 20+ host or container platform works.

## Required environment
See `.env.example`. Minimum for production:
`DATABASE_URL`, `APP_URL`, `JWT_SECRET` (openssl rand -hex 32), `ENCRYPTION_KEY` (openssl rand -hex 32 — back it up; losing it makes encrypted ID/bank numbers unreadable), `OTP_DEV_MODE=false`, `PAYMENT_PROVIDER` + gateway keys, `STORAGE_DIR` on persistent disk, SMS/email provider keys.

## Release procedure (all platforms)
1. `npm ci && npm run build`
2. `npm run db:migrate` (idempotent; run on every release before switching traffic)
3. Start: `node .next/standalone/server.js` (copy `public/` and `.next/static/` next to it — the Dockerfile does this)
4. Health check: `GET /api/health` → `{status:"ok", db:"ok"}`
5. First deploy only: create your super admin (register, then in SQL: insert into user_roles the SUPER_ADMIN role) — never run the demo seed in production. Then Admin → Settings: legal name, GSTIN, address, support email/phone/WhatsApp (OTP-protected).

## Docker / any VM (AWS EC2, GCP Compute, Azure VM, DigitalOcean)
```
cp .env.example .env   # fill in
docker compose up -d --build
```
Put Nginx/Caddy or a cloud load balancer with TLS in front. Uploads persist in the `uploads` volume.

## AWS
- **App:** ECS Fargate (image from Dockerfile, target `runner`) or App Runner. Mount EFS at `/data/storage` (or implement the S3 storage driver).
- **DB:** RDS PostgreSQL 16, Multi-AZ, automated backups 7–35 days, PITR on. `DATABASE_SSL=true`.
- **Migrations:** one-off ECS task using target `tools` running `npm run db:migrate`.
- Secrets in AWS Secrets Manager → task env.

## Google Cloud
Cloud Run (container) + Cloud SQL for PostgreSQL (connect via Cloud SQL connector or private IP). Use a Cloud Run job for migrations. For uploads use a Filestore mount or implement GCS driver (Cloud Run disk is ephemeral).

## Azure
Azure Container Apps or App Service for Containers + Azure Database for PostgreSQL Flexible Server. Azure Files mount for `/data/storage`.

## Render / Railway
- Create a PostgreSQL instance and a Web Service from this repo (Docker).
- Pre-deploy command: `npm run db:migrate`.
- Add a persistent disk mounted at `/data/storage` and set `STORAGE_DIR=/data/storage`.

## Vercel
Works for the web tier (serverless). Use Neon/Supabase/RDS Postgres with pooling (`DB_POOL_MAX=1`–`3` per function). Local disk isn't persistent on Vercel — implement the S3/Blob storage driver in `src/services/storage.ts` before accepting uploads. Run migrations from CI (`npm run db:migrate`). The in-memory rate limiter/settings cache is per-instance; add Redis (Upstash) for strict limits.

## Payment webhooks
- Razorpay Dashboard → Webhooks → URL `https://<domain>/api/webhooks/payments/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `payment.failed`, `refund.processed`.
- Events are stored in `payment_webhooks` (idempotent by event id) and invalid signatures are logged (Admin → Payments → Webhooks).

## Database backups
- Managed DB: enable automated backups + point-in-time recovery; test restores monthly.
- Self-hosted: nightly `pg_dump -Fc stayshare > stayshare-$(date +%F).dump`, keep 30 days off-site (S3 with lifecycle), and weekly restore drills into a staging DB. Back up `STORAGE_DIR` (ID proofs, photos) with the same retention and encryption at rest.
- Never lose `ENCRYPTION_KEY` — store it in a secrets manager with its own backup.

## Scaling notes
- Stateless app servers; scale horizontally behind a load balancer.
- Replace the in-memory rate limiter (`src/lib/rate-limit.ts`) and settings cache with Redis for multi-instance deployments.
- Schedule periodic jobs (cron/cloud scheduler) that call internal maintenance: hold sweeping happens on demand already; add daily jobs for subscription expiry and check-in reminders (notify `checkin.upcoming`).
