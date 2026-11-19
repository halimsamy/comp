import { db } from '@db';
import { loadFrameworkScores } from '../frameworks/scoring/framework-scoring.loader';
import { DAY_MS } from './overview-utils';

/** UTC calendar day, the snapshot key. */
export function snapshotDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Write today's score for every framework instance of the org, using the same
 * API scoring the overview and framework pages show. Re-running on the same
 * day overwrites that day's row.
 */
export async function recordComplianceSnapshots({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}): Promise<number> {
  const instances = await db.frameworkInstance.findMany({
    where: { organizationId },
    select: {
      id: true,
      framework: { select: { name: true } },
      customFramework: { select: { name: true } },
    },
  });
  if (instances.length === 0) return 0;

  const scores = await loadFrameworkScores({
    organizationId,
    frameworkInstanceIds: instances.map((i) => i.id),
    now,
  });
  const date = snapshotDay(now);

  for (const instance of instances) {
    const score = scores.get(instance.id);
    const values = {
      frameworkName:
        instance.framework?.name ??
        instance.customFramework?.name ??
        'Framework',
      scorePercent: Math.round(score?.complianceScore ?? 0),
      controlsComplete: score?.controlsComplete ?? 0,
      controlsTotal: score?.controlsTotal ?? 0,
      requirementsSatisfied: score?.requirementsSatisfied ?? 0,
      requirementsTotal: score?.requirementsTotal ?? 0,
    };
    await db.complianceSnapshot.upsert({
      where: {
        frameworkInstanceId_date: { frameworkInstanceId: instance.id, date },
      },
      create: {
        organizationId,
        frameworkInstanceId: instance.id,
        date,
        ...values,
      },
      update: values,
    });
  }
  return instances.length;
}

export interface TrendPoint {
  date: string;
  scorePercent: number;
  controlsComplete: number;
  controlsTotal: number;
}

export interface FrameworkTrend {
  frameworkInstanceId: string;
  frameworkName: string;
  points: TrendPoint[];
}

export const TREND_RANGES_DAYS = [30, 90, 180, 365] as const;

/** Daily score history per framework instance over the last `days` days, oldest first. */
export async function loadComplianceTrends({
  organizationId,
  days,
  now = new Date(),
}: {
  organizationId: string;
  days: number;
  now?: Date;
}): Promise<{ days: number; frameworks: FrameworkTrend[] }> {
  const since = new Date(snapshotDay(now).getTime() - days * DAY_MS);
  const rows = await db.complianceSnapshot.findMany({
    where: { organizationId, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: {
      frameworkInstanceId: true,
      frameworkName: true,
      date: true,
      scorePercent: true,
      controlsComplete: true,
      controlsTotal: true,
    },
  });

  const byInstance = new Map<string, FrameworkTrend>();
  for (const row of rows) {
    const trend = byInstance.get(row.frameworkInstanceId) ?? {
      frameworkInstanceId: row.frameworkInstanceId,
      frameworkName: row.frameworkName,
      points: [],
    };
    // Rows are oldest first, so the latest name wins after a rename.
    trend.frameworkName = row.frameworkName;
    trend.points.push({
      date: row.date.toISOString().slice(0, 10),
      scorePercent: row.scorePercent,
      controlsComplete: row.controlsComplete,
      controlsTotal: row.controlsTotal,
    });
    byInstance.set(row.frameworkInstanceId, trend);
  }
  return { days, frameworks: [...byInstance.values()] };
}
