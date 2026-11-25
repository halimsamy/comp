import { db, AttachmentEntityType } from '@db';
import type {
  NormalizedAutomation,
  NormalizedEvidenceRun,
} from './evidence-export.types';
import {
  type AppAutomationRun,
  type CustomAutomationRun,
  normalizeAppAutomationRun,
  normalizeCustomAutomationRun,
} from './evidence-normalizer';

export { getAutomationHeaders } from './evidence-automation-headers';

const RUN_BATCH_SIZE = 50;

// Loads one automation's runs in batches to bound both JSON.parse and heap pressure.
export async function loadFullAutomation({
  taskId,
  header,
}: {
  taskId: string;
  header: NormalizedAutomation;
}): Promise<NormalizedAutomation> {
  const runs: NormalizedEvidenceRun[] = [];
  for await (const batch of streamAutomationRuns({ taskId, header })) {
    runs.push(...batch);
  }
  return { ...header, runs };
}

// Yields runs in batches so callers can process incrementally without
// accumulating all runs in memory. Each batch is GC-eligible after processing.
export async function* streamAutomationRuns({
  taskId,
  header,
}: {
  taskId: string;
  header: NormalizedAutomation;
}): AsyncGenerator<NormalizedEvidenceRun[]> {
  if (header.type === 'app_automation' && header.checkId) {
    yield* streamAppRuns(taskId, header.checkId);
  } else {
    yield* streamCustomRuns(taskId, header.id);
  }
}

async function* streamAppRuns(
  taskId: string,
  checkId: string,
): AsyncGenerator<NormalizedEvidenceRun[]> {
  let cursor: { id: string } | undefined;

  for (;;) {
    const batch = await db.integrationCheckRun.findMany({
      where: { taskId, checkId },
      include: {
        results: true,
        connection: { include: { provider: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RUN_BATCH_SIZE,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    yield batch.map((run) =>
      normalizeAppAutomationRun(toAppAutomationRun(run)),
    );

    if (batch.length < RUN_BATCH_SIZE) break;
    cursor = { id: batch[batch.length - 1].id };
  }
}

async function* streamCustomRuns(
  taskId: string,
  automationId: string,
): AsyncGenerator<NormalizedEvidenceRun[]> {
  let cursor: { id: string } | undefined;

  for (;;) {
    const batch = await db.evidenceAutomationRun.findMany({
      where: {
        evidenceAutomation: { id: automationId, taskId },
        version: { not: null },
      },
      include: {
        evidenceAutomation: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RUN_BATCH_SIZE,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    yield batch.map((run) =>
      normalizeCustomAutomationRun(toCustomAutomationRun(run)),
    );

    if (batch.length < RUN_BATCH_SIZE) break;
    cursor = { id: batch[batch.length - 1].id };
  }
}

// Prisma result → normalizer interface mappers (single source of truth).
function toAppAutomationRun(run: {
  id: string;
  checkId: string;
  checkName: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  totalChecked: number;
  passedCount: number;
  failedCount: number;
  errorMessage: string | null;
  logs: unknown;
  createdAt: Date;
  connection: { provider: { slug: string; name: string } | null };
  results: Array<{
    id: string;
    passed: boolean;
    resourceType: string;
    resourceId: string;
    title: string;
    description: string | null;
    severity: string | null;
    remediation: string | null;
    evidence: unknown;
    collectedAt: Date;
  }>;
}): AppAutomationRun {
  return {
    id: run.id,
    checkId: run.checkId,
    checkName: run.checkName,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    totalChecked: run.totalChecked,
    passedCount: run.passedCount,
    failedCount: run.failedCount,
    errorMessage: run.errorMessage,
    logs: run.logs,
    createdAt: run.createdAt,
    connection: {
      provider: run.connection.provider
        ? {
            slug: run.connection.provider.slug,
            name: run.connection.provider.name,
          }
        : undefined,
    },
    results: run.results.map((r) => ({
      id: r.id,
      passed: r.passed,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      title: r.title,
      description: r.description,
      severity: r.severity,
      remediation: r.remediation,
      evidence: r.evidence,
      collectedAt: r.collectedAt,
    })),
  };
}

function toCustomAutomationRun(run: {
  id: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  runDuration: number | null;
  success: boolean | null;
  error: string | null;
  logs: unknown;
  output: unknown;
  evaluationStatus: string | null;
  evaluationReason: string | null;
  createdAt: Date;
  evidenceAutomation: { id: string; name: string };
}): CustomAutomationRun {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    runDuration: run.runDuration,
    success: run.success,
    error: run.error,
    logs: run.logs,
    output: run.output,
    evaluationStatus: run.evaluationStatus,
    evaluationReason: run.evaluationReason,
    createdAt: run.createdAt,
    evidenceAutomation: {
      id: run.evidenceAutomation.id,
      name: run.evidenceAutomation.name,
    },
  };
}

export async function findTasksWithEvidence(
  organizationId: string,
): Promise<string[]> {
  const [tasksWithRuns, taskAttachments] = await Promise.all([
    db.task.findMany({
      where: {
        organizationId,
        OR: [
          { integrationCheckRuns: { some: {} } },
          {
            evidenceAutomations: {
              some: { runs: { some: { version: { not: null } } } },
            },
          },
        ],
      },
      select: { id: true },
    }),
    db.attachment.findMany({
      where: {
        organizationId,
        entityType: AttachmentEntityType.task,
      },
      select: { entityId: true },
      distinct: ['entityId'],
    }),
  ]);

  const ids = new Set<string>();
  for (const t of tasksWithRuns) ids.add(t.id);
  for (const a of taskAttachments) ids.add(a.entityId);
  return Array.from(ids);
}
