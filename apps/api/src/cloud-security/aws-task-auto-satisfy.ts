import { Logger } from '@nestjs/common';
import { db, TaskStatus } from '@db';
import { autoCompleteTaskData } from '../tasks/task-completion';
import {
  AWS_SERVICE_EVIDENCE_ONLY_MAPPINGS,
  AWS_SERVICE_TASK_MAPPINGS,
  AWS_TASK_EVIDENCE_CHECK_ID,
} from './aws-task-mappings';

export { AWS_TASK_EVIDENCE_CHECK_ID };
import type { SecurityFinding } from './cloud-security.service';

/** Distinct scanMode so reconciliation never diffs a scan against it. */
const EVIDENCE_SCAN_MODE = 'task_evidence';

const COMPLETABLE: TaskStatus[] = ['todo', 'in_progress', 'failed'];
const ATTACHABLE: TaskStatus[] = [...COMPLETABLE, 'in_review'];

const logger = new Logger('AwsTaskAutoSatisfy');

const servicesMappedTo = (map: Record<string, string[]>, templateId: string) =>
  Object.entries(map)
    .filter(([, templates]) => templates.includes(templateId))
    .map(([serviceId]) => serviceId);

export function groupFindingsByService(findings: SecurityFinding[]) {
  const byService = new Map<string, SecurityFinding[]>();
  for (const finding of findings) {
    const serviceId = finding.evidence?.serviceId;
    if (typeof serviceId !== 'string') continue;
    byService.set(serviceId, [...(byService.get(serviceId) ?? []), finding]);
  }
  return byService;
}

/**
 * Which task templates a scan satisfies, and which only get its results.
 * A template is satisfied when every SCANNED service mapped to it passes all
 * its findings. Evidence-only templates get results whenever scanned.
 */
export function planAwsTaskUpdates(
  byService: Map<string, SecurityFinding[]>,
): { satisfy: Map<string, string[]>; attachOnly: Map<string, string[]> } {
  const passes = (serviceId: string) =>
    (byService.get(serviceId) ?? []).every((f) => f.passed);

  const satisfy = new Map<string, string[]>();
  const attachOnly = new Map<string, string[]>();
  const templates = (map: Record<string, string[]>) =>
    new Set([...byService.keys()].flatMap((s) => map[s] ?? []));

  for (const templateId of templates(AWS_SERVICE_TASK_MAPPINGS)) {
    const scanned = servicesMappedTo(AWS_SERVICE_TASK_MAPPINGS, templateId).filter(
      (s) => byService.has(s),
    );
    if (scanned.every(passes)) satisfy.set(templateId, scanned);
  }
  for (const templateId of templates(AWS_SERVICE_EVIDENCE_ONLY_MAPPINGS)) {
    if (satisfy.has(templateId)) continue;
    attachOnly.set(
      templateId,
      servicesMappedTo(AWS_SERVICE_EVIDENCE_ONLY_MAPPINGS, templateId).filter((s) =>
        byService.has(s),
      ),
    );
  }
  return { satisfy, attachOnly };
}

/**
 * Auto-satisfy evidence tasks from a passing AWS scan and attach the results.
 *
 * - AUTOMATED tasks → 'done' (next due date + lastCompletedAt set)
 * - MANUAL tasks → 'in_review': a person still owns the manual part
 * - Evidence-only links → results attached, status untouched
 * - Never fails a task; never touches done / not_relevant tasks
 */
export async function autoSatisfyAwsTasks({
  organizationId,
  connectionId,
  findings,
  now = new Date(),
}: {
  organizationId: string;
  connectionId: string;
  findings: SecurityFinding[];
  now?: Date;
}): Promise<void> {
  const byService = groupFindingsByService(findings);
  const { satisfy, attachOnly } = planAwsTaskUpdates(byService);
  if (satisfy.size === 0 && attachOnly.size === 0) return;

  const tasks = await db.task.findMany({
    where: {
      organizationId,
      archivedAt: null,
      taskTemplateId: { in: [...satisfy.keys(), ...attachOnly.keys()] },
      status: { in: ATTACHABLE },
    },
    select: {
      id: true,
      status: true,
      taskTemplateId: true,
      frequency: true,
      automationStatus: true,
    },
  });

  let changed = 0;
  for (const task of tasks) {
    const templateId = task.taskTemplateId ?? '';
    const services = satisfy.get(templateId) ?? attachOnly.get(templateId) ?? [];
    const update =
      satisfy.has(templateId) && COMPLETABLE.includes(task.status)
        ? autoCompleteTaskData(task, now)
        : null;

    if (update) {
      // Status guard in the WHERE so a concurrent human change wins.
      const result = await db.task.updateMany({
        where: { id: task.id, organizationId, status: { in: COMPLETABLE } },
        data: update,
      });
      changed += result.count;
    } else if (await attachedToday({ taskId: task.id, now })) {
      continue;
    }

    await attachScanResults({
      connectionId,
      taskId: task.id,
      services,
      findings: services.flatMap((s) => byService.get(s) ?? []),
    });
  }

  if (changed > 0) {
    logger.log(
      `Auto-satisfied ${changed} evidence task(s) from passing AWS scan (org ${organizationId})`,
    );
  }
}

// Open tasks are re-scanned daily; one attachment per day is enough evidence.
async function attachedToday({ taskId, now }: { taskId: string; now: Date }) {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const existing = await db.integrationCheckRun.findFirst({
    where: {
      taskId,
      checkId: AWS_TASK_EVIDENCE_CHECK_ID,
      createdAt: { gte: startOfDay },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function attachScanResults({
  connectionId,
  taskId,
  services,
  findings,
}: {
  connectionId: string;
  taskId: string;
  services: string[];
  findings: SecurityFinding[];
}) {
  const passedCount = findings.filter((f) => f.passed).length;
  const failedCount = findings.length - passedCount;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const run = await tx.integrationCheckRun.create({
      data: {
        connectionId,
        taskId,
        checkId: AWS_TASK_EVIDENCE_CHECK_ID,
        checkName: `AWS scan evidence (${services.join(', ')})`,
        status: failedCount > 0 ? 'failed' : 'success',
        startedAt: now,
        completedAt: now,
        totalChecked: findings.length,
        passedCount,
        failedCount,
        scannedServices: services,
        scanMode: EVIDENCE_SCAN_MODE,
      },
    });
    if (findings.length === 0) return;
    await tx.integrationCheckResult.createMany({
      data: findings.map((f) => ({
        checkRunId: run.id,
        passed: f.passed ?? false,
        resourceType: f.resourceType,
        resourceId: f.resourceId,
        title: f.title,
        description: f.description ?? '',
        severity: f.passed ? 'info' : f.severity,
        remediation: f.remediation ?? null,
        evidence: (f.evidence ?? {}) as object,
        collectedAt: new Date(f.createdAt),
      })),
    });
  });
}
