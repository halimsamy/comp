## Self-hosting Comp

`docker-compose.yml` runs the whole stack on one machine:

| Service | What | Listens on |
|---------|------|------------|
| `postgres` | PostgreSQL 17 + pgvector (data, vector search, job queues) | 127.0.0.1:5432 |
| `valkey`, `redis-http` | Valkey behind an Upstash-compatible REST proxy (rate limits, caches) | 127.0.0.1:8079 |
| `s3`, `s3-init` | SeaweedFS S3-compatible file storage, bucket creation | 127.0.0.1:8333 |
| `api`, `api-worker` | NestJS API and its background job worker | 127.0.0.1:3333 |
| `app`, `app-worker` | Main app and its background job worker | 127.0.0.1:3000 |
| `portal` | Employee portal | 127.0.0.1:3002 |
| `migrator`, `seeder` | One-off: database migrations, framework/template seed data | — |

Everything listens on 127.0.0.1 only. Put a TLS reverse proxy (Caddy, nginx) on the same
machine in front of four public URLs: app, portal, API and file storage. They can be four
hostnames or one hostname on four ports (login cookies are shared across ports). Users'
browsers talk to all four directly, and the services call the public URLs server-side too.

### Prerequisites

- Docker Engine with the compose plugin, and roughly 8 GB RAM plus swap for the image builds
- A TLS reverse proxy and DNS for the four URLs
- [SendGrid](https://sendgrid.com) account with a verified sender domain
- Anthropic (Claude) and Voyage AI API keys

### Configuration

| File | Used by |
|------|---------|
| `.env` (repo root) | compose itself: `APP_URL`, `PORTAL_URL`, `API_URL`, `POSTGRES_PASSWORD`, `SRH_TOKEN`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `COMP_CA_CERT` |
| `apps/api/.env` | api, api-worker, migrator, seeder |
| `apps/app/.env` | app, app-worker |
| `apps/portal/.env` | portal |

Start from the `.env.example` files. Key settings:

- **URLs**: `APP_URL`/`PORTAL_URL`/`API_URL` in the root `.env` are baked into the app and
  portal images at build time; rebuild after changing them. In the api env: `BASE_URL` (API
  URL), `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` (app URL), `AUTH_TRUSTED_ORIGINS`
  (app and portal URLs).
- **Database**: `DATABASE_URL=postgresql://comp:$POSTGRES_PASSWORD@localhost:5432/comp` in all
  three env files (`localhost` connections skip TLS; any other host requires TLS).
- **Secrets**: the same `SECRET_KEY`, `ENCRYPTION_KEY`, `UNSUBSCRIBE_SECRET`,
  `INTERNAL_API_TOKEN`, `SERVICE_TOKEN_TRIGGER` and `SERVICE_TOKEN_PORTAL` wherever they
  appear; `AUTH_SECRET` (app, portal) and `BETTER_AUTH_SECRET` (portal) = `SECRET_KEY`.
- **Redis**: `UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079`, `UPSTASH_REDIS_REST_TOKEN=$SRH_TOKEN`.
- **Email**: `SENDGRID_API_KEY` and `EMAIL_FROM_*` in the api env (sent by the api worker).
- **Self-hosted mode**: the app image is built with `NEXT_PUBLIC_SELF_HOSTED=true`, so every
  organization is approved without billing; set `SELF_HOSTED=true` in the api env too.
- **Pentests**: the api won't boot without `MACED_API_KEY`; if you don't use the pentest
  product, set a placeholder with the right prefix, e.g. `mc_dev_unused`.
- **Private CA**: if the proxy's certificate comes from a private CA, set `COMP_CA_CERT` to
  its root certificate so server-side calls to the public URLs verify.

**Feature Flags (without PostHog):**
- Feature flags normally come from PostHog. Without it, every flag is off; turn flags on for
  everyone with `FORCE_ENABLED_FEATURE_FLAGS` (comma-separated) in `apps/app/.env`:
  `ai-vendor-questionnaire`, `is-ai-policy-assistant-enabled`, `is-isms-enabled`,
  `is-timeline-enabled`, `is-trust-nda-enabled`, `is-web-automations-enabled`

### File Storage

Files (attachments, policy PDFs, logos, questionnaires) live in SeaweedFS (`s3_data`
volume). Set in the app, portal and api env files:

```bash
APP_AWS_ENDPOINT=https://files.yourdomain.com   # the file-storage URL, proxied to 127.0.0.1:8333
APP_AWS_REGION=us-east-1
APP_AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY
APP_AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY
APP_AWS_BUCKET_NAME=comp-attachments
APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET=comp-questionnaires
APP_AWS_KNOWLEDGE_BASE_BUCKET=comp-knowledge-base
APP_AWS_ORG_ASSETS_BUCKET=comp-org-assets
FLEET_AGENT_BUCKET_NAME=comp-device-agent   # api only
```

Browsers upload and download through presigned URLs signed for `APP_AWS_ENDPOINT`; the
proxy must pass the `Host` header through unchanged. Leave `APP_AWS_ENDPOINT` empty to use
AWS S3 instead.

### Build & Run

```bash
# 1. Build (one at a time keeps memory use down)
for s in api api-worker app app-worker portal; do docker compose build $s; done

# 2. Infrastructure, then migrate & seed
docker compose up -d postgres valkey redis-http s3 s3-init
docker compose run --rm migrator
docker compose run --rm seeder

# 3. Start
docker compose up -d
```

To upgrade: `git pull`, rebuild, run the migrator, `docker compose up -d`.

Background jobs run on pg-boss inside PostgreSQL (schema `pgboss`); `api-worker` and
`app-worker` process them and register scheduled jobs when they start. See
`packages/jobs/README.md`.

### Backups

Back up the `postgres_data` and `s3_data` volumes, e.g. nightly
`docker compose exec -T postgres pg_dump -U comp -Fc comp > comp-$(date +%F).dump` plus a copy
of the SeaweedFS data, and keep the env files somewhere safe: without `ENCRYPTION_KEY` the
stored integration credentials cannot be decrypted.

### Troubleshooting

```bash
docker compose ps
docker compose logs -f api app
```

The images are built with `SKIP_ENV_VALIDATION=true`, so missing variables only cause
errors at runtime.
