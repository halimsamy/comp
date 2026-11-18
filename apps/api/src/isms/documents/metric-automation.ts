import { db } from '@db';
import { lockDocument } from '../utils/document-lock';
import {
  addPeriods,
  periodStartFor,
  type MetricCadenceValue,
} from '../utils/metric-periods';
import {
  computePlatformMetrics,
  isComputedMetricKey,
} from './metric-compute-data';

export const COMPUTED_SOURCE = 'computed';

export type MetricPeriodChoice = 'current' | 'previous';

export interface ComputedMetricPreview {
  metricId: string;
  metricKey: string;
  name: string;
  cadence: MetricCadenceValue;
  periodStart: string;
  value: string;
  note: string;
  recordedForPeriod: boolean;
}

function targetPeriod({
  cadence,
  now,
  period,
}: {
  cadence: MetricCadenceValue;
  now: Date;
  period: MetricPeriodChoice;
}): string {
  const current = periodStartFor(cadence, now);
  return period === 'current' ? current : addPeriods(cadence, current, -1);
}

/**
 * Computed values for every active, computable metric of a Monitoring (9.1)
 * document, and whether the target period already has a measurement.
 */
export async function previewComputedMetrics({
  documentId,
  organizationId,
  now = new Date(),
  period = 'current',
}: {
  documentId: string;
  organizationId: string;
  now?: Date;
  period?: MetricPeriodChoice;
}): Promise<ComputedMetricPreview[]> {
  const metrics = await db.ismsMetric.findMany({
    where: {
      documentId,
      isActive: true,
      cadence: { not: null },
      document: { organizationId, type: 'monitoring' },
    },
    select: {
      id: true,
      metricKey: true,
      name: true,
      cadence: true,
      measurements: { select: { periodStart: true } },
    },
    orderBy: { position: 'asc' },
  });
  const computable = metrics.filter((metric) => isComputedMetricKey(metric.metricKey));
  if (computable.length === 0) return [];

  const values = await computePlatformMetrics({ organizationId, now });
  return computable.flatMap((metric) => {
    if (!metric.cadence || !isComputedMetricKey(metric.metricKey)) return [];
    const periodStart = targetPeriod({ cadence: metric.cadence, now, period });
    const computed = values[metric.metricKey];
    return [
      {
        metricId: metric.id,
        metricKey: metric.metricKey,
        name: metric.name,
        cadence: metric.cadence,
        periodStart,
        value: computed.value,
        note: computed.note,
        recordedForPeriod: metric.measurements.some(
          (row) => row.periodStart.toISOString().slice(0, 10) === periodStart,
        ),
      },
    ];
  });
}

/**
 * Record computed values as measurements for the target period, skipping
 * metrics that already have one (never overwrites a human entry). Values
 * marked 'n/a' (nothing to measure yet) are skipped too.
 */
export async function recordComputedMetrics({
  documentId,
  organizationId,
  memberId,
  now = new Date(),
  period = 'current',
}: {
  documentId: string;
  organizationId: string;
  memberId?: string | null;
  now?: Date;
  period?: MetricPeriodChoice;
}): Promise<{ count: number }> {
  const previews = await previewComputedMetrics({
    documentId,
    organizationId,
    now,
    period,
  });
  const rows = previews
    .filter((row) => !row.recordedForPeriod && row.value !== 'n/a')
    .map((row) => ({
      metricId: row.metricId,
      documentId,
      periodStart: new Date(`${row.periodStart}T00:00:00.000Z`),
      value: row.value,
      note: `Computed by Comp AI. ${row.note}`,
      enteredById: memberId ?? null,
      source: COMPUTED_SOURCE,
    }));
  if (rows.length === 0) return { count: 0 };
  // Measurements are operational records: no approval invalidation (see
  // IsmsMeasurementService).
  return db.$transaction(async (tx) => {
    await lockDocument(tx, documentId);
    // Re-check under the lock so a concurrent run can't double-record.
    const existing = await tx.ismsMeasurement.findMany({
      where: { OR: rows.map(({ metricId, periodStart }) => ({ metricId, periodStart })) },
      select: { metricId: true, periodStart: true },
    });
    const taken = new Set(
      existing.map((row) => `${row.metricId}:${row.periodStart.toISOString()}`),
    );
    const data = rows.filter(
      (row) => !taken.has(`${row.metricId}:${row.periodStart.toISOString()}`),
    );
    const created = await tx.ismsMeasurement.createMany({ data });
    return { count: created.count };
  });
}
