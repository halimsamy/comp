# Migrating from trigger.dev to @trycompai/jobs

Work through this guide for each file. Each pattern shows the code **before**, then **after**.
If a construct is not covered here, it is not supported. Stop and report it; do not invent a
replacement. Background on the package is in [README.md](./README.md).

Ground rules:

- Change imports and the trigger.dev-specific plumbing only. Keep business logic, task ids,
  payload shapes and file locations as they are. Tasks stay in `apps/api/src/trigger/**` and
  `apps/app/src/trigger/**`, which are the directories the workers load.
- Never add `as any`, `@ts-ignore` or `@ts-expect-error`. If types do not line up, the guide
  below says how to fix them.
- After each file, run that package's tests: `cd apps/api && npx jest <path>` or
  `cd apps/app && npx vitest run <path>`.

---

## 1. Imports

| Before | After |
| --- | --- |
| `import { task, schemaTask, schedules, tasks, logger, metadata, queue, runs, tags, idempotencyKeys } from '@trigger.dev/sdk';` | the same names `from '@trycompai/jobs'` |
| `from '@trigger.dev/sdk/v3'` | `from '@trycompai/jobs'` |
| `import type { Task } from '@trigger.dev/sdk';` | `import type { Task } from '@trycompai/jobs';` |
| `import { auth } from '@trigger.dev/sdk'` / `auth as triggerAuth` | **delete** (see section 4) |
| `import { useRealtimeRun, useRun } from '@trigger.dev/react-hooks';` | `import { useJobRun } from '@/hooks/use-job-run';` (section 5) |
| `import { TriggerAuthContext } from '@trigger.dev/react-hooks';` | **delete** (section 6) |
| `import ... from '@trigger.dev/build'` | **delete**; this only appears in config and extension files (section 10) |

Other types are exported too: `RunStatus`, `RetrievedRun`, `TaskRunResult`, `BatchResult`,
`ScheduledPayload`, `TriggerOptions`, `TaskPayload`, `TaskOutput`, `RunOutput`, `AnyTask`.

---

## 2. Task definitions

These forms work unchanged once the import is swapped:

```ts
// before: from '@trigger.dev/sdk'   after: from '@trycompai/jobs'
export const updatePolicyQueue = queue({ name: 'update-policy', concurrencyLimit: 15 });

export const updatePolicy = schemaTask({
  id: 'update-policy',
  queue: updatePolicyQueue,
  schema: z.object({ organizationId: z.string(), policyId: z.string() }),
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  maxDuration: 600,
  machine: 'large-1x',        // accepted, ignored
  run: async (payload, { ctx, signal }) => { ... },
});

export const nightly = schedules.task({
  id: 'nightly',
  cron: '0 5 * * *',          // UTC
  run: async (payload) => { payload.timestamp; payload.lastTimestamp; },
});
```

Details:

- **The task must be exported.** The worker only registers exported tasks.
- **`run` options**: `{ ctx, signal }` is available. `ctx.run.id`, `ctx.run.tags`,
  `ctx.task.id` and `ctx.attempt.number` exist. Nothing else on `ctx` does: remove uses
  of `ctx.machine`, `ctx.environment`, `ctx.project` and `ctx.deployment`.
- **`maxDuration` is seconds.** A few files pass milliseconds (for example `1000 * 60 * 10`).
  Change them to seconds (`60 * 10`). Values are capped at 24h either way.
- **Lifecycle hooks** (`onStart`, `onSuccess`, `onFailure`, `init`, `cleanup`, `middleware`)
  are not supported. None are used today; do not add any.
- **`queue()`** gives per-process concurrency. `concurrencyLimit: 1` gives a cluster-wide
  singleton. The queue `name` is informational, because every task gets its own pg-boss
  queue named after its id. Never share one `queue()` between two tasks.
- **Payload and output are JSON.** A `Date` in a payload arrives as an ISO string. If a task
  reads a payload `Date` field, parse it (`new Date(payload.at)`) or use `z.coerce.date()`
  in the schema. Outputs follow the same rule. (Schedule payload dates are real `Date`s.)
- **Org ownership**: put `organizationId` (or `orgId`) at the top level of the payload of any
  task whose run a user will see. That field becomes `JobRun.organizationId`, which the run
  endpoint scopes by. A UI-polled task whose payload lacks it (for example
  `analyze-vendor-login`, which takes `{ url }`) must have `organizationId` added to its payload
  and to its trigger call.

### Duplicate task ids (MANDATORY)

Task ids must be unique across **both** workers, because the queue name is the task id.
Today one id collides: `update-policy` exists in `apps/api/src/trigger/policies/update-policy.ts`
and in `apps/app/src/trigger/tasks/onboarding/update-policy.ts`.

**Rule:** apps/api keeps the original id. The apps/app copy is renamed to
`onboarding-<original id>`:

```ts
// apps/app/src/trigger/tasks/onboarding/update-policy.ts
// before
export const updatePolicyQueue = queue({ name: 'update-policy', concurrencyLimit: 15 });
export const updatePolicy = schemaTask({ id: 'update-policy', queue: updatePolicyQueue, ... });
// after
export const updatePolicyQueue = queue({ name: 'onboarding-update-policy', concurrencyLimit: 15 });
export const updatePolicy = schemaTask({ id: 'onboarding-update-policy', queue: updatePolicyQueue, ... });

// apps/app/src/trigger/tasks/onboarding/onboard-organization-helpers.ts (~line 1321)
// before
tasks.batchTrigger<typeof updatePolicy>('update-policy', items)
// after
tasks.batchTrigger<typeof updatePolicy>('onboarding-update-policy', items)
```

Grep `apps/app` for any other string `'update-policy'` that refers to the app task and rename
it too. Callers in apps/api (`policies.controller.ts`, `admin-policies.controller.ts`,
`frameworks.service.ts`) stay on `'update-policy'`. Apply the same rule to any new collision,
then check:

```bash
bun run --cwd packages/jobs check-ids     # must print "Task ids are unique"
```

---

## 3. Triggering, waiting, runs, metadata

```ts
// unchanged apart from the import
const handle = await tasks.trigger<typeof myTask>('my-task', payload, {
  tags: [organizationId], idempotencyKey, idempotencyKeyTTL: '30m', delay: '5m', maxAttempts: 1,
});
handle.id                          // 'jrun_…' (was 'run_…')
await tasks.batchTrigger<typeof myTask>('my-task', [{ payload }, { payload, options }]);
await myTask.trigger(payload);     // task-instance methods work too

// waiting from inside a task (polls JobRun; no deadlock, but the wait counts toward maxDuration)
const result = await tasks.triggerAndWait<typeof child>('child', payload);
if (result.ok) result.output; else result.error;
const output = await child.triggerAndWait(payload).unwrap();
const batch = await tasks.batchTriggerAndWait<typeof child>('child', items);
batch.runs.map((r) => (r.ok ? r.output : null));

const key = await idempotencyKeys.create(`email-${id}`, { scope: 'global' });

const run = await runs.retrieve<typeof myTask>(runId);   // throws if not found
run.status; run.output; run.error; run.metadata; run.tags; run.taskIdentifier;
run.organizationId; run.isCompleted; run.isSuccess; run.isFailed; run.isCancelled;
await runs.cancel(runId);          // marks CANCELED; running code is not interrupted

await tags.add(['vendor:123']);    // current run only
metadata.set('progress', 50); metadata.increment('done', 1); metadata.append('logs', line);
metadata.get('progress'); metadata.current(); await metadata.flush();
metadata.parent.increment('completed', 1);   // a root run is its own parent and root
metadata.root.set('phase', 'policies');
```

These differences require edits:

| Before | After |
| --- | --- |
| `handle.publicAccessToken` | does not exist; remove it (section 4) |
| `run.payload` after `runs.retrieve` | payloads are **not stored**. Use `run.organizationId`, `run.taskIdentifier` and `run.tags`. To bind a run to another record, add a tag when triggering (`tags: [orgId, \`batch:${batch.id}\`]`) and check it with `run.tags.includes(\`batch:${batch.id}\`)`. |
| `auth.withAuth({ accessToken: process.env.TRIGGER_APP_SECRET_KEY }, () => runs.retrieve(id))` | `runs.retrieve(id)`. Both apps share one database, so there is no cross-project auth. |
| `concurrencyKey` trigger option | kept: with `queue.concurrencyLimit: 1` it allows one active run per key; ignored otherwise |
| `machine`, `queue` trigger options | accepted and ignored; leave them or delete them |
| `run.costInCents`, `run.durationMs`, `run.attempts` | not available. Use `run.attemptCount`, `run.startedAt` and `run.finishedAt` |
| `runs.list`, `runs.subscribeToRun`, `wait.for`, `batch.trigger` | not supported (unused today) |

Example: `apps/api/src/cloud-security/remediation-batch.service.ts` `validateRun`:

```ts
// before
const run = await this.withAppProject(() => runs.retrieve(params.runId));
const payload = runPayloadSchema.safeParse(run.payload);
if (run.taskIdentifier !== 'remediate-batch' || !run.tags.includes(orgId) || !payload.success
    || payload.data.batchId !== batch.id || ...) throw new NotFoundException('Run not found');
// after (the trigger site adds tags: [orgId, `batch:${batch.id}`, `connection:${batch.connectionId}`])
const run = await runs.retrieve(params.runId);
if (run.taskIdentifier !== 'remediate-batch' || run.organizationId !== batch.organizationId
    || !run.tags.includes(`batch:${batch.id}`) || !run.tags.includes(`connection:${batch.connectionId}`))
  throw new NotFoundException('Run not found');
```

Delete `withAppProject`, `runPayloadSchema`, the `TRIGGER_APP_SECRET_KEY` check and the matching
spec cases. Make the same change in apps/app `cloud-tests/actions/batch-fix.ts` and
`integrations/[slug]/actions/batch-fix.ts`.

---

## 4. Remove public access tokens (server side)

The browser now reads runs through `GET /v1/job-runs/:runId`, using session and organization
auth. Tokens disappear completely.

```ts
// before (apps/api/src/policies/policies.controller.ts)
const handle = await tasks.trigger<typeof updatePolicy>('update-policy', {...});
const publicAccessToken = await triggerAuth.createPublicToken({
  scopes: { read: { runs: [handle.id] } },
});
return { data: { runId: handle.id, publicAccessToken }, ... };
// after
const handle = await tasks.trigger<typeof updatePolicy>('update-policy', {...});
return { data: { runId: handle.id }, ... };
```

- Remove `publicAccessToken` and `accessToken` from response DTOs, `@ApiProperty` docs,
  server-action return values, zod response schemas and the specs that assert them. Remove the
  `auth.createPublicToken` mocks in specs.
- `cookies().set('publicAccessToken', …)` in `setup/actions/create-organization.ts` and
  `onboarding/actions/complete-onboarding.ts`: delete it. Delete every
  `cookieStore.get('publicAccessToken')`.
- Delete `apps/app/src/actions/trigger/heal-access-token.ts` and its test.
- **Every task id a UI polls must be listed in `apps/api/src/job-runs/job-run-access.ts`
  (`JOB_RUN_READ_RESOURCES`)**, with each resource whose private data its output or metadata
  carries. Unlisted tasks return 404. The list starts with the old status route's map plus
  the tasks the UIs poll today. When you migrate a UI and its task is not listed, add the task
  using the same `@RequirePermission` resources as the endpoint that triggers it, and add a
  case to `apps/api/src/job-runs/job-runs.controller.spec.ts`.
- Delete `apps/app/src/app/api/tasks/[taskId]/status/` (route, access, test). It has no
  callers, and `GET /v1/job-runs/:runId` with `job-run-access.ts` replaces it. Then delete
  `GET /v1/auth/task-status-access` in `apps/api/src/auth/auth.controller.ts`, together with
  its spec cases.

---

## 5. Frontend: useRealtimeRun / useRun → useJobRun

```tsx
// before
import { useRealtimeRun } from '@trigger.dev/react-hooks';
const [runInfo, setRunInfo] = useState<{ runId: string; accessToken: string } | null>(null);
const { run } = useRealtimeRun<typeof updatePolicy>(runInfo?.runId ?? '', {
  accessToken: runInfo?.accessToken ?? '',
  enabled: !!runInfo?.runId && !!runInfo?.accessToken,
  onComplete: (run, err) => { ... },
});
// after
import { useJobRun } from '@/hooks/use-job-run';
const [runId, setRunId] = useState<string | null>(null);
const { run, error } = useJobRun<typeof updatePolicy>(runId, {
  enabled: !!runId,
  onComplete: (run) => { ... },   // fires once, on ANY terminal status; check run.status
});
```

```tsx
// before
const { run, error } = useRun(triggerJobId || '', { refreshInterval: 1000 });
// after
const { run, error } = useJobRun(triggerJobId, { refreshInterval: 1000 });
```

- `run` is `undefined` until loaded. It has `id`, `taskId` (**not** `taskIdentifier`),
  `status`, `output`, `error` (`{ message, name? } | null`), `metadata`, `tags`, `createdAt`,
  `startedAt` and `finishedAt`. Dates are ISO strings.
- `isJobRunFinished(run?.status)` (exported from the same file) replaces terminal-status lists.
- `onComplete`'s second `error` argument is never passed. Branch on `run.status !== 'COMPLETED'`.
- The generic accepts `typeof someTask` (giving the output type) or a plain output type.
  Do not import a task module into a client component; use `import type`.
- Only the run id travels from server to client now. Delete token state, the `accessToken`
  props, and the conditions that read `accessToken`.
- Old trigger.dev run ids still stored in the DB (`Onboarding.triggerJobId`,
  `RemediationBatch.triggerRunId`, …) return 404, which arrives as `error`. Treat `error`
  like "no active run" and do not leave a spinner running. `error` is set only for a 404;
  network errors, 5xx and 429 keep the last `run` and polling continues.

---

## 6. Frontend providers

- Delete `apps/app/src/components/trigger-provider.tsx` and
  `apps/app/src/components/trigger-token-provider.tsx`.
- `apps/app/src/app/(app)/[orgId]/layout.tsx`: remove the `<TriggerTokenProvider …>` wrapper,
  keeping its children, and remove the `publicAccessToken` cookie read. Update
  `layout.test.tsx` and drop its `trigger-token-provider` mock.
- `apps/app/src/app/(app)/setup/go/[id]/page.tsx`: remove the wrapper and the cookie read, and
  keep rendering `<OnboardingStatus …>`, which now uses `useJobRun(triggerJobId)`.

---

## 7. Test mocks

```ts
// jest (apps/api) — before
jest.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: mockTrigger }, auth: { createPublicToken: jest.fn() } }));
// after (drop auth)
jest.mock('@trycompai/jobs', () => ({ tasks: { trigger: (...a: unknown[]) => mockTrigger(...a) } }));

// vitest (apps/app) — before
vi.mock('@trigger.dev/sdk', () => ({ logger: {...}, schedules: { task: (c) => c } }));
// after
vi.mock('@trycompai/jobs', () => ({ logger: {...}, schedules: { task: (c) => c } }));

// frontend hooks — before
vi.mock('@trigger.dev/react-hooks', () => ({ useRealtimeRun: () => ({ run: null }) }));
// after
vi.mock('@/hooks/use-job-run', () => ({
  useJobRun: () => ({ run: undefined, error: undefined, isLoading: false }),
  isJobRunFinished: () => false,
}));
```

Rewrite assertions on `publicAccessToken` or `createPublicToken` to assert that they are
absent, or delete them. Assertions that a handle id looks like `run_…` become `jrun_…` or
any string.

---

## 8. Other files

- `apps/api/src/vector-store/logger.ts` reads `TRIGGER_RUN_ID`, `TRIGGER_TASK_ID` and
  `TRIGGER_WORKER_ID` to detect that it is running inside a worker. Replace that check with
  `process.env.JOBS_WORKER === '1'`. `startWorker` sets it before it loads any task module.
- `packages/db/src/postinstall.ts` checks `TRIGGER_PRISMA_FORCE_GENERATE`,
  `TRIGGER_SECRET_KEY` and `TRIGGER_DEPLOYMENT`. Remove those clauses and keep `CI` and
  `PRISMA_GENERATE_ON_INSTALL`.
- `SERVICE_TOKEN_TRIGGER` and the `trigger` service definition stay. Workers still call the
  API with that token. Do not rename them in this migration.

---

## 9. Verify

```bash
bun run --cwd packages/jobs check-ids
bun run --cwd apps/api worker:dry-run      # lists every api task; no DB needed
bun run --cwd apps/app worker:dry-run
grep -rn "@trigger.dev" apps packages --include='*.ts' --include='*.tsx'   # must be empty at the end
```

Never start a worker against a non-local database while migrating. Dry-run never connects.

---

## 10. Final cleanup (one agent, after all call sites are migrated)

- Delete `apps/api/trigger.config.ts`, `apps/app/trigger.config.ts`,
  `apps/api/{caBundleExtension,customPrismaExtension,emailExtension,integrationPlatformExtension}.ts`
  and `apps/app/{caBundleExtension,customPrismaExtension}.ts`. The worker entrypoints already
  set `NODE_EXTRA_CA_CERTS`, and bun resolves workspace packages directly.
- Remove `@trigger.dev/sdk`, `@trigger.dev/build`, `@trigger.dev/react-hooks` and
  `trigger.dev` from `apps/api/package.json` and `apps/app/package.json`. Change the `dev`
  scripts to run `worker:dev` instead of `trigger dev`, delete `dev:trigger`,
  `deploy:trigger-prod` (also in the root `package.json`) and `dev:no-trigger`. Then run `bun install`.
- Remove `TRIGGER_SECRET_KEY`, `TRIGGER_API_KEY`, `TRIGGER_API_URL`, `TRIGGER_ACCESS_TOKEN`,
  `TRIGGER_APP_SECRET_KEY` and `TRIGGER_PRISMA_FORCE_GENERATE` from `.env.example` files,
  `env.mjs` schemas, turbo.json and the docker or CI config. Replace the
  `.github/workflows/trigger-*-deploy-*.yml` workflows with worker deployments, which run
  `bun src/worker.ts` in apps/api and apps/app.
- Remove `apps/app/next.config.ts` entries that only existed for trigger.dev, if any. Keep
  `pg-boss` in `serverExternalPackages`.
- Apply the `JobRun` migration (`packages/db/prisma/migrations/20261110000000_add_job_run`)
  through the normal migration workflow before the first deploy. The `pgboss` schema is
  created by the first worker or producer that starts, but only workers create queues: a
  trigger for a task whose queue does not exist yet throws. Deploy the workers before the code
  that triggers, so that queues exist with their final policy.
