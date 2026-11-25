import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { NormalizedAutomation, TaskEvidenceSummary } from './evidence-export.types';
import { normalizeStatus } from './evidence-normalizer';
import { TASK_DETAILS_INCLUDE, taskDetails } from './task-summary-details';

interface AppRunHeader {
  checkId: string;
  checkName: string;
  status: string;
  failedCount: number;
  createdAt: Date;
  connection: { provider: { slug: string; name: string } | null };
}

interface CustomRunHeader {
  status: string;
  evaluationStatus: string | null;
  createdAt: Date;
  evidenceAutomation: { id: string; name: string };
}

function groupAppRunHeaders(runs: AppRunHeader[]): NormalizedAutomation[] {
  const grouped = new Map<string, NormalizedAutomation>();

  for (const run of runs) {
    const key = run.checkId;
    const status = normalizeStatus(run.status);

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: run.checkId,
        name: run.checkName,
        type: 'app_automation',
        integrationName: run.connection.provider?.name,
        checkId: run.checkId,
        runs: [],
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        latestRunAt: null,
      });
    }

    const automation = grouped.get(key)!;
    automation.totalRuns++;

    if (status === 'success' && run.failedCount === 0) {
      automation.successfulRuns++;
    } else if (status === 'failed' || run.failedCount > 0) {
      automation.failedRuns++;
    }

    if (!automation.latestRunAt || run.createdAt > automation.latestRunAt) {
      automation.latestRunAt = run.createdAt;
    }
  }

  return Array.from(grouped.values());
}

function groupCustomRunHeaders(
  runs: CustomRunHeader[],
): NormalizedAutomation[] {
  const grouped = new Map<string, NormalizedAutomation>();

  for (const run of runs) {
    const key = run.evidenceAutomation.id;
    const status = normalizeStatus(run.status);

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: run.evidenceAutomation.id,
        name: run.evidenceAutomation.name,
        type: 'custom_automation',
        runs: [],
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        latestRunAt: null,
      });
    }

    const automation = grouped.get(key)!;
    automation.totalRuns++;

    if (run.evaluationStatus === 'pass') {
      automation.successfulRuns++;
    } else if (run.evaluationStatus === 'fail' || status === 'failed') {
      automation.failedRuns++;
    }

    if (!automation.latestRunAt || run.createdAt > automation.latestRunAt) {
      automation.latestRunAt = run.createdAt;
    }
  }

  return Array.from(grouped.values());
}

// Lightweight metadata query — no run results or logs loaded.
export async function getAutomationHeaders({
  organizationId,
  taskId,
}: {
  organizationId: string;
  taskId: string;
}): Promise<TaskEvidenceSummary> {
  const task = await db.task.findFirst({
    where: { id: taskId, organizationId },
    include: { organization: { select: { name: true, primaryColor: true } }, ...TASK_DETAILS_INCLUDE },
  });

  if (!task) {
    throw new NotFoundException('Task not found');
  }

  const HEADER_BATCH = 500;
  const appRuns: AppRunHeader[] = [];
  let appCursor: string | undefined;
  while (true) {
    const batch = await db.integrationCheckRun.findMany({
      where: { taskId },
      select: {
        id: true,
        checkId: true,
        checkName: true,
        status: true,
        failedCount: true,
        createdAt: true,
        connection: {
          select: { provider: { select: { slug: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: HEADER_BATCH,
      ...(appCursor ? { cursor: { id: appCursor }, skip: 1 } : {}),
    });
    appRuns.push(...batch);
    if (batch.length < HEADER_BATCH) break;
    appCursor = batch[batch.length - 1]!.id;
  }

  const customRuns: CustomRunHeader[] = [];
  let customCursor: string | undefined;
  while (true) {
    const batch = await db.evidenceAutomationRun.findMany({
      where: {
        evidenceAutomation: { taskId },
        version: { not: null },
      },
      select: {
        id: true,
        status: true,
        evaluationStatus: true,
        createdAt: true,
        evidenceAutomation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: HEADER_BATCH,
      ...(customCursor ? { cursor: { id: customCursor }, skip: 1 } : {}),
    });
    customRuns.push(...batch);
    if (batch.length < HEADER_BATCH) break;
    customCursor = batch[batch.length - 1]!.id;
  }

  return {
    taskId: task.id,
    taskTitle: task.title,
    organizationId,
    organizationName: task.organization.name,
    primaryColor: task.organization.primaryColor,
    automations: [
      ...groupAppRunHeaders(appRuns),
      ...groupCustomRunHeaders(customRuns),
    ],
    exportedAt: new Date(),
    task: taskDetails(task),
  };
}
