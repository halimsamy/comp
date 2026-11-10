## Self-hosting Comp (Apps + Portal)

This file is a brief overview for Docker-based self-hosting.

**For the detailed, up-to-date guide, see:**

- [Docker Self-Hosting Guide](https://trycomp.ai/docs/self-hosting/docker)
- [Environment Reference](https://trycomp.ai/docs/self-hosting/env-reference)

### Quick Summary

Docker uses **separate env files** (not a root `.env`):

| File | Services |
|------|----------|
| `packages/db/.env` | migrator, seeder |
| `apps/app/.env` | app |
| `apps/portal/.env` | portal |

### Minimal Required Environment

For a functional deployment:

- **Database**: `DATABASE_URL` in all three env files
- **Auth**: `AUTH_SECRET`, `SECRET_KEY`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` (app); `BETTER_AUTH_SECRET` (portal)
- **Email**: `SENDGRID_API_KEY` and `EMAIL_FROM_SYSTEM` / `EMAIL_FROM_DEFAULT` in api (sent by the api job worker)
- **Background jobs**: no extra keys; the job workers use `DATABASE_URL`
- **Misc**: `REVALIDATION_SECRET`, `NEXT_PUBLIC_PORTAL_URL` in app

**Self-Hosted Mode:**
- Set `NEXT_PUBLIC_SELF_HOSTED=true` in `apps/app/.env` to mark the instance as self-hosted
- When enabled, organizations are automatically approved and bypass the payment/booking flow
- `STRIPE_SECRET_KEY` is not required for self-hosted instances

### Prerequisites

- Docker Desktop or Docker Engine
- External PostgreSQL 14+ with SSL and the [pgvector](https://github.com/pgvector/pgvector) extension available (used for vector search)
- [SendGrid](https://sendgrid.com) account with a verified sender domain

### Build & Run

```bash
# 1. Create env files from examples
cp packages/db/.env.example packages/db/.env
cp apps/app/.env.example apps/app/.env
cp apps/portal/.env.example apps/portal/.env
# Edit each with your production values

# 2. Export build args
export BETTER_AUTH_URL="https://app.yourdomain.com"
export BETTER_AUTH_URL_PORTAL="https://portal.yourdomain.com"

# 3. Build
docker compose build --no-cache

# 4. Migrate & seed
docker compose run --rm migrator
docker compose run --rm seeder

# 5. Start
docker compose up -d s3 s3-init app portal
```

### File Storage

Files (attachments, policy PDFs, logos, questionnaires) live in the bundled S3-compatible
store, SeaweedFS (`s3` service, data in the `s3_data` volume); `s3-init` creates the
buckets listed in `S3_BUCKETS`. Export `S3_ACCESS_KEY` and `S3_SECRET_KEY` before
`docker compose up`, then set in the app, portal and api env files:

```bash
APP_AWS_ENDPOINT=https://files.yourdomain.com   # proxied (TLS) to port 8333
APP_AWS_REGION=us-east-1
APP_AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY
APP_AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY
APP_AWS_BUCKET_NAME=comp-attachments
APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET=comp-questionnaires
APP_AWS_KNOWLEDGE_BASE_BUCKET=comp-knowledge-base
APP_AWS_ORG_ASSETS_BUCKET=comp-org-assets
FLEET_AGENT_BUCKET_NAME=comp-device-agent   # api only
```

Browsers upload and download through presigned URLs signed for `APP_AWS_ENDPOINT`, so it
must be one URL that both the containers and your users' browsers can reach. Leave
`APP_AWS_ENDPOINT` empty to use AWS S3 instead.

### Background Job Workers

Background jobs run on pg-boss inside your PostgreSQL database (schema `pgboss`), so no
extra service is needed. Run the two workers next to the app and API, from a checkout of
the repo with dependencies installed (`bun install`) and the same env files as the app
they belong to:

```bash
bun run --cwd packages/email build && bun run --cwd packages/integration-platform build
bun run --cwd apps/api worker   # API jobs (needs apps/api/.env)
bun run --cwd apps/app worker   # app jobs (needs apps/app/.env; needs Chrome for puppeteer)
```

The API worker can also run as a container: build `apps/api/Dockerfile.multistage` with
`--target worker`. Keep at least one replica of each worker running; scheduled jobs (cron)
are registered by the workers when they start. See `packages/jobs/README.md`.

### Troubleshooting

View logs to debug missing env vars:

```bash
docker compose logs app
docker compose logs portal
```

The Dockerfile sets `SKIP_ENV_VALIDATION=true` at build time, so missing variables only cause errors at runtime.

See the [full troubleshooting guide](https://trycomp.ai/docs/self-hosting/docker#troubleshooting) for common issues.
