import { jobsSchema, sql } from './boss';
import { ACTIVE_STATUSES } from './options';
import type { RunError, RunStatus } from './types';

/** Raw SQL against the Prisma-managed "JobRun" table (packages/db/prisma/schema/job-run.prisma). */
export interface JobRunRow {
  id: string;
  taskId: string;
  status: RunStatus;
  output: unknown;
  error: RunError | null;
  metadata: Record<string, unknown>;
  tags: string[];
  organizationId: string | null;
  parentRunId: string | null;
  rootRunId: string | null;
  bossJobId: string | null;
  idempotencyKey: string | null;
  idempotencyKeyExpiresAt: Date | null;
  attempt: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}

// Prisma stores UTC in `timestamp without time zone`; read/write explicitly as UTC.
const NOW = `timezone('UTC', now())`;
const utc = (column: string) => `"${column}" AT TIME ZONE 'UTC' AS "${column}"`;
const COLUMNS = [
  '"id"', '"taskId"', '"status"', '"output"', '"error"', '"metadata"', '"tags"',
  '"organizationId"', '"parentRunId"', '"rootRunId"', '"bossJobId"', '"idempotencyKey"',
  utc('idempotencyKeyExpiresAt'), '"attempt"', utc('createdAt'), utc('startedAt'),
  utc('finishedAt'), utc('updatedAt'),
].join(', ');
const ACTIVE = ACTIVE_STATUSES.map((s) => `'${s}'`).join(', ');
const UNIQUE_VIOLATION = '23505';

export interface NewRun {
  taskId: string;
  status: RunStatus;
  tags: string[];
  organizationId: string | null;
  parentRunId: string | null;
  rootRunId: string | null;
  idempotencyKey: string | null;
  idempotencyKeyExpiresAt: Date | null;
  metadata: Record<string, unknown>;
}

async function insertRow(run: NewRun): Promise<JobRunRow> {
  const [row] = await sql<JobRunRow>(
    `INSERT INTO "JobRun" ("taskId", "status", "tags", "organizationId", "parentRunId", "rootRunId",
       "idempotencyKey", "idempotencyKeyExpiresAt", "metadata", "createdAt", "updatedAt")
     VALUES ($1, $2, $3::text[], $4, $5, $6, $7, $8::timestamptz AT TIME ZONE 'UTC', $9::jsonb, ${NOW}, ${NOW})
     RETURNING ${COLUMNS}`,
    [
      run.taskId, run.status, run.tags, run.organizationId, run.parentRunId, run.rootRunId,
      run.idempotencyKey, run.idempotencyKeyExpiresAt?.toISOString() ?? null,
      JSON.stringify(run.metadata),
    ],
  );
  if (!row) throw new Error('Failed to insert JobRun');
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

/**
 * Inserts a run. With an idempotency key, returns the existing run for the same
 * task + key (cached: true) unless that key's TTL has passed or its enqueue failed.
 */
export async function insertRun(run: NewRun): Promise<{ row: JobRunRow; cached: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { row: await insertRow(run), cached: false };
    } catch (error) {
      if (!run.idempotencyKey || !isUniqueViolation(error)) throw error;
    }
    const [existing] = await sql<JobRunRow>(
      `SELECT ${COLUMNS} FROM "JobRun" WHERE "taskId" = $1 AND "idempotencyKey" = $2`,
      [run.taskId, run.idempotencyKey],
    );
    if (!existing) continue;
    const expired = existing.idempotencyKeyExpiresAt && existing.idempotencyKeyExpiresAt < new Date();
    // SYSTEM_FAILURE means the enqueue failed: like trigger.dev, a failed trigger must not hold the key.
    if (!expired && existing.status !== 'SYSTEM_FAILURE') return { row: existing, cached: true };
    // Release the key so the retry can claim it.
    await sql(`UPDATE "JobRun" SET "idempotencyKey" = NULL WHERE "id" = $1`, [existing.id]);
  }
  throw new Error(`Could not claim idempotency key for task ${run.taskId}`);
}

export async function setBossJobId(params: { runId: string; bossJobId: string }) {
  await sql(`UPDATE "JobRun" SET "bossJobId" = $2, "updatedAt" = ${NOW} WHERE "id" = $1`, [
    params.runId,
    params.bossJobId,
  ]);
}

export async function getRunRow(runId: string): Promise<JobRunRow | null> {
  const [row] = await sql<JobRunRow>(`SELECT ${COLUMNS} FROM "JobRun" WHERE "id" = $1`, [runId]);
  return row ?? null;
}

export async function getRunRows(runIds: string[]): Promise<JobRunRow[]> {
  return sql<JobRunRow>(`SELECT ${COLUMNS} FROM "JobRun" WHERE "id" = ANY($1::text[])`, [runIds]);
}

/**
 * QUEUED/DELAYED -> EXECUTING, or a newer attempt taking over an EXECUTING run (crash recovery).
 * Returns null when the run is terminal (e.g. canceled) or already executing at this attempt or later.
 */
export async function claimRun(params: { runId: string; attempt: number }): Promise<JobRunRow | null> {
  const [row] = await sql<JobRunRow>(
    `UPDATE "JobRun" SET "status" = 'EXECUTING', "attempt" = $2,
       "startedAt" = COALESCE("startedAt", ${NOW}), "updatedAt" = ${NOW}
     WHERE "id" = $1 AND "status" IN (${ACTIVE})
       AND NOT ("status" = 'EXECUTING' AND "attempt" >= $2) RETURNING ${COLUMNS}`,
    [params.runId, params.attempt],
  );
  return row ?? null;
}

/** Moves an active run to a terminal status. No-op if it is already terminal. */
export async function finishRun(params: {
  runId: string;
  status: RunStatus;
  output?: unknown;
  error?: RunError;
}): Promise<boolean> {
  const rows = await sql(
    `UPDATE "JobRun" SET "status" = $2, "output" = $3::jsonb, "error" = $4::jsonb,
       "finishedAt" = ${NOW}, "updatedAt" = ${NOW}
     WHERE "id" = $1 AND "status" IN (${ACTIVE}) RETURNING "id"`,
    [
      params.runId,
      params.status,
      params.output === undefined ? null : JSON.stringify(params.output),
      params.error ? JSON.stringify(params.error) : null,
    ],
  );
  return rows.length > 0;
}

/** A failed attempt that pg-boss will retry. */
export async function requeueRun(params: { runId: string; error: RunError }) {
  await sql(
    `UPDATE "JobRun" SET "status" = 'QUEUED', "error" = $2::jsonb, "updatedAt" = ${NOW}
     WHERE "id" = $1 AND "status" = 'EXECUTING'`,
    [params.runId, JSON.stringify(params.error)],
  );
}

/**
 * Worker shutdown with the attempt still running: puts its run back to QUEUED and gives the
 * pg-boss job one extra retry, so the fail that follows re-queues it without spending an attempt.
 */
export async function releaseForShutdown(params: { queue: string; job: { id: string; retryCount: number } }) {
  const { queue, job } = params;
  await sql(
    `UPDATE "JobRun" SET "status" = 'QUEUED', "updatedAt" = ${NOW}
     WHERE "bossJobId" = $1 AND "status" = 'EXECUTING' AND "attempt" = $2`,
    [job.id, job.retryCount + 1],
  );
  await sql(
    `UPDATE ${jobsSchema()}.job SET retry_limit = retry_limit + 1
     WHERE name = $1 AND id = $2::uuid AND state = 'active' AND retry_count = $3`,
    [queue, job.id, job.retryCount],
  );
}

export async function cancelRunRow(runId: string): Promise<JobRunRow | null> {
  const [row] = await sql<JobRunRow>(
    `UPDATE "JobRun" SET "status" = 'CANCELED', "finishedAt" = ${NOW}, "updatedAt" = ${NOW}
     WHERE "id" = $1 AND "status" IN (${ACTIVE}) RETURNING ${COLUMNS}`,
    [runId],
  );
  return row ?? null;
}

export async function addRunTags(params: { runId: string; tags: string[] }) {
  await sql(
    `UPDATE "JobRun" SET "tags" = ARRAY(SELECT DISTINCT unnest("tags" || $2::text[])), "updatedAt" = ${NOW}
     WHERE "id" = $1`,
    [params.runId, params.tags],
  );
}

/** createdAt of the previous run of a scheduled task (for ScheduledPayload.lastTimestamp). */
export async function previousRunAt(params: { taskId: string; beforeRunId: string }) {
  const [row] = await sql<{ createdAt: Date }>(
    `SELECT ${utc('createdAt')} FROM "JobRun" WHERE "taskId" = $1 AND "id" <> $2
     ORDER BY "createdAt" DESC LIMIT 1`,
    [params.taskId, params.beforeRunId],
  );
  return row?.createdAt;
}

export type MetadataOp =
  | { type: 'set'; key: string; value: unknown }
  | { type: 'del'; key: string }
  | { type: 'increment'; key: string; by: number }
  | { type: 'append'; key: string; value: unknown };

const METADATA_SQL: Record<MetadataOp['type'], string> = {
  set: `jsonb_set("metadata", ARRAY[$2::text], $3::jsonb, true)`,
  del: `"metadata" - $2::text`,
  increment: `jsonb_set("metadata", ARRAY[$2::text], to_jsonb(
    (CASE WHEN jsonb_typeof("metadata"->$2::text) = 'number' THEN ("metadata"->>$2::text)::numeric ELSE 0 END)
    + ($3::jsonb #>> '{}')::numeric), true)`,
  append: `jsonb_set("metadata", ARRAY[$2::text],
    (CASE WHEN jsonb_typeof("metadata"->$2::text) = 'array' THEN "metadata"->$2::text ELSE '[]'::jsonb END)
    || jsonb_build_array($3::jsonb), true)`,
};

/** Atomic in SQL, so concurrent children incrementing a parent's counters don't lose updates. */
export async function applyMetadataOp(params: { runId: string; op: MetadataOp }) {
  const { runId, op } = params;
  const value = op.type === 'increment' ? op.by : op.type === 'del' ? null : op.value;
  await sql(
    `UPDATE "JobRun" SET "metadata" = ${METADATA_SQL[op.type]}, "updatedAt" = ${NOW} WHERE "id" = $1`,
    [runId, op.key, JSON.stringify(value ?? null)],
  );
}

/**
 * Marks runs whose pg-boss job is gone or finished as CRASHED (was executing) or
 * EXPIRED (never started), and deletes finished runs past retention.
 */
export async function sweepRuns(params: { retentionDays: number }) {
  const schema = jobsSchema();
  await sql(
    `UPDATE "JobRun" r SET
       "status" = CASE WHEN r."status" = 'EXECUTING' THEN 'CRASHED' ELSE 'EXPIRED' END,
       "finishedAt" = ${NOW}, "updatedAt" = ${NOW}
     WHERE r."status" IN (${ACTIVE}) AND r."bossJobId" IS NOT NULL
       AND r."updatedAt" < ${NOW} - interval '5 minutes'
       AND NOT EXISTS (SELECT 1 FROM ${schema}.job j
         WHERE j.id = r."bossJobId"::uuid AND j.state IN ('created', 'retry', 'active'))`,
  );
  await sql(
    `DELETE FROM "JobRun" WHERE "finishedAt" < ${NOW} - make_interval(days => $1::int)`,
    [params.retentionDays],
  );
}
