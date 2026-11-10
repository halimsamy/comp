# @trycompai/jobs

Background jobs on Postgres (pg-boss), with the trigger.dev SDK subset this repo uses.
It replaces `@trigger.dev/sdk` and `@trigger.dev/react-hooks`. There is no new infrastructure:
queues live in the `pgboss` schema of the app database, and run state lives in the Prisma
`JobRun` table. To move existing code over, follow [MIGRATION.md](./MIGRATION.md).

## Pieces

| Piece | Where |
| --- | --- |
| Task definitions and triggering (`task`, `schemaTask`, `schedules.task`, `tasks.*`, `metadata`, `runs`, `tags`, `logger`, `idempotencyKeys`, `queue`) | `@trycompai/jobs` |
| Worker runtime (`startWorker`) | `@trycompai/jobs/worker` (server only; never import it from Next.js code) |
| Run state (status, output, error, metadata, tags, org, parent and root) | `JobRun` model, `packages/db/prisma/schema/job-run.prisma` |
| Queue tables (jobs, schedules, archive) | Postgres schema `pgboss`. pg-boss creates and migrates it when it starts, so it is not managed by Prisma. |
| Run status for the browser | `GET /v1/job-runs/:runId` (apps/api `job-runs` module) |
| React hook | `useJobRun` in `apps/app/src/hooks/use-job-run.ts` |
| Worker entrypoints | `apps/api/src/worker.ts`, `apps/app/src/worker.ts` |

## Usage

```ts
import { logger, metadata, schedules, schemaTask, task, tasks } from '@trycompai/jobs';
import { z } from 'zod';

export const exportEvidence = schemaTask({
  id: 'export-organization-evidence',     // globally unique across ALL workers
  schema: z.object({ organizationId: z.string() }),
  retry: { maxAttempts: 3 },
  maxDuration: 600,                        // seconds
  run: async ({ organizationId }, { ctx, signal }) => {
    metadata.set('progress', 0);
    logger.info('exporting', { organizationId, runId: ctx.run.id });
    return { downloadUrl: '...' };
  },
});

export const nightly = schedules.task({
  id: 'nightly-cleanup',
  cron: '0 3 * * *',                       // always UTC
  run: async (payload) => { /* payload.timestamp, payload.lastTimestamp */ },
});

// From the API, a Next.js route or another task:
const handle = await tasks.trigger<typeof exportEvidence>('export-organization-evidence', {
  organizationId,
});
return { runId: handle.id };              // the browser polls it with useJobRun(runId)
```

Rules:

- A task module must **export** the task. The worker registers every exported task found
  under its `dirs`.
- The run's `organizationId` comes from `payload.organizationId` (or `payload.orgId`). A run
  without one is never visible through `GET /v1/job-runs/:runId`.
- The browser sees a run only if its task id is listed in
  `apps/api/src/job-runs/job-run-access.ts` and the caller has `read` on each listed resource.
- Payloads are never stored in `JobRun`. Inputs and outputs travel as JSON, so a `Date`
  becomes a string.

## Running workers

```bash
bun run --cwd apps/api worker              # loads apps/api/src/trigger/**
bun run --cwd apps/app worker              # loads apps/app/src/trigger/**
bun run --cwd apps/api worker:dry-run      # print the task manifest; no DB connection
bun run --cwd packages/jobs check-ids      # fail if a task id exists in both workers
```

Workers run **from source with bun**. They need the same env as the app they belong to
(DATABASE_URL, API keys, and so on). Workspace packages that are consumed through `dist`
(`@trycompai/email`, `@trycompai/integration-platform`) must be built first.
The app worker needs Chrome available for puppeteer tasks.

On start the worker:

1. imports every task module;
2. creates or updates one pg-boss queue per task (retry, backoff, expiry);
3. syncs cron schedules, removing stale ones that it owns;
4. polls each queue.

On SIGTERM or SIGINT it stops fetching, waits for in-flight runs
(JOBS_SHUTDOWN_TIMEOUT_MS), re-queues the runs that are left without spending one of their
attempts, and exits. Set the container stop timeout (ECS `stopTimeout`, max 120s) above
JOBS_SHUTDOWN_TIMEOUT_MS so short runs can finish; long runs restart from the beginning on the
next worker.

Only workers create queues. Triggering a task whose queue does not exist yet throws, so deploy a
worker before (or with) the first code that triggers its new tasks.

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `JOBS_DATABASE_URL` | `DATABASE_URL` | Postgres used for queues and `JobRun` |
| `JOBS_SCHEMA` | `pgboss` | pg-boss schema name |
| `JOBS_DB_POOL_MAX` | 10 (worker) or 3 (producer) | pg pool size |
| `JOBS_DEFAULT_CONCURRENCY` | 10 | Per-process concurrency for tasks without `queue.concurrencyLimit` |
| `JOBS_POLL_INTERVAL_MS` | 2000 | Idle poll interval per queue |
| `JOBS_RUN_RETENTION_DAYS` | 30 | Finished `JobRun` rows older than this are deleted |
| `JOBS_SHUTDOWN_TIMEOUT_MS` | 25000 | Drain timeout on SIGTERM |
| `JOBS_DRY_RUN` | unset | `1`: print the manifest and exit without connecting |
| `NODE_EXTRA_CA_CERTS` | set by the worker entrypoints | RDS CA bundle (`packages/db/certs/rds-global-bundle.pem`) |

TLS follows `@trycompai/db/ssl-config`, the same rules Prisma uses.

## Semantics worth knowing

- **Retries**: `retry.maxAttempts` (default 3) maps to pg-boss `retryLimit = maxAttempts - 1`,
  with exponential backoff between `minTimeoutInMs` and `maxTimeoutInMs`.
  `TIMED_OUT` is never retried.
- **maxDuration** is in seconds (default 300) and is capped at 24h. It is enforced by
  aborting `signal` and failing the attempt. Time spent waiting in
  `triggerAndWait`/`batchTriggerAndWait` counts toward it.
- **Concurrency** applies per worker process. `concurrencyLimit: 1` is the exception: it
  becomes a pg-boss `singleton` queue, so only one job per `concurrencyKey` (trigger option,
  mapped to pg-boss `singletonKey`) is active cluster-wide; without a key, one job in total.
  The worker refuses to start if such a queue already exists with the `standard` policy.
- **maxDuration vs. queued jobs**: pg-boss stores the expiry on each job at send time. An
  attempt is timed out at the smaller of the task's current maxDuration and that stored expiry.
- **Cancel** marks the run `CANCELED` and removes the queued job. Code that is already
  running is not interrupted.
- **Crash recovery**: a sweep every 5 minutes marks active runs whose pg-boss job is gone
  as `CRASHED` (running) or `EXPIRED` (never started).
- **Statuses and flags** use the trigger.dev names: `QUEUED`, `DELAYED`, `EXECUTING`,
  `COMPLETED`, `FAILED`, `CANCELED`, `CRASHED`, `TIMED_OUT`, `EXPIRED`, `SYSTEM_FAILURE`,
  and so on, with `isCompleted`, `isSuccess`, `isFailed` and `isCancelled`.
- **Ignored options**: `machine` is accepted and ignored, and so is `concurrencyKey` on queues
  whose `concurrencyLimit` is not 1. `ttl` is
  best effort: it is checked when the job is picked up.

## Tests

```bash
bun run --cwd packages/jobs test           # unit tests, with pg-boss and the DB faked
# Optional live test, against a throwaway LOCAL Postgres only:
docker run -d --rm --name jobs-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16
JOBS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres bun test src/__tests__/integration.pg.test.ts
```
