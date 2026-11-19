import { db } from '@db';
import { getOverviewScores } from '../frameworks/frameworks-scores.helper';
import { loadRequirementDefinitions } from '../frameworks/frameworks-requirements.helper';
import { loadInstanceScoring } from '../frameworks/scoring/requirement-scoring';
import { type AuditWindow, projectPhases } from './timeline-projection';

const pct = (completed: number, total: number) =>
  total > 0 ? Math.round((completed / total) * 100) : 0;

/**
 * Live % per AUTO_* phase type for each framework instance. Policies and
 * tasks come from that framework's own scorer (the evidence its controls
 * need); people training is org-wide.
 */
export async function loadTimelinePercentages({
  organizationId,
  frameworkInstanceIds,
}: {
  organizationId: string;
  frameworkInstanceIds: string[];
}): Promise<Map<string, Record<string, number>>> {
  const ids = [...new Set(frameworkInstanceIds)];
  const [overview, instances] = await Promise.all([
    getOverviewScores(organizationId).catch(() => null),
    db.frameworkInstance.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, frameworkId: true, customFrameworkId: true, currentVersionId: true },
    }),
  ]);
  const people = overview ? pct(overview.people.completed, overview.people.total) : undefined;

  const result = new Map<string, Record<string, number>>();
  await Promise.all(
    instances.map(async (instance) => {
      const requirements = await loadRequirementDefinitions(instance);
      const { scores } = await loadInstanceScoring({
        organizationId,
        frameworkInstanceId: instance.id,
        requirementKeys: requirements.map((r) => r.id),
      });
      result.set(instance.id, {
        AUTO_POLICIES: pct(scores.counts.policies.completed, scores.counts.policies.total),
        AUTO_TASKS: pct(scores.counts.tasks.completed, scores.counts.tasks.total),
        ...(people !== undefined ? { AUTO_PEOPLE: people } : {}),
      });
    }),
  );
  return result;
}

/** Latest active or planned audit engagement per framework instance. */
export async function loadAuditWindows(
  organizationId: string,
): Promise<Map<string, AuditWindow>> {
  const audits = await db.auditEngagement.findMany({
    where: { organizationId, status: { not: 'completed' } },
    select: { frameworkInstanceId: true, periodStart: true, periodEnd: true },
    orderBy: { periodStart: 'desc' },
  });
  const result = new Map<string, AuditWindow>();
  for (const audit of audits) {
    if (!result.has(audit.frameworkInstanceId)) result.set(audit.frameworkInstanceId, audit);
  }
  return result;
}

export interface OverduePhase {
  timelineId: string;
  frameworkInstanceId: string;
  frameworkName: string;
  phaseId: string;
  phaseName: string;
  dueDate: Date;
}

/** Active timeline phases past their end date, for the overview deadlines. */
export async function listOverduePhases(
  organizationId: string,
  now: Date = new Date(),
): Promise<OverduePhase[]> {
  const timelines = await db.timelineInstance.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: {
      phases: { orderBy: { orderIndex: 'asc' } },
      frameworkInstance: {
        select: { framework: { select: { name: true } }, customFramework: { select: { name: true } } },
      },
    },
  });
  return timelines.flatMap((timeline) =>
    projectPhases({ phases: timeline.phases, now })
      .filter((phase) => phase.isOverdue && phase.endDate)
      .map((phase) => ({
        timelineId: timeline.id,
        frameworkInstanceId: timeline.frameworkInstanceId,
        frameworkName:
          timeline.frameworkInstance.framework?.name ??
          timeline.frameworkInstance.customFramework?.name ??
          'Framework',
        phaseId: phase.id,
        phaseName: phase.name,
        dueDate: phase.endDate as Date,
      })),
  );
}
