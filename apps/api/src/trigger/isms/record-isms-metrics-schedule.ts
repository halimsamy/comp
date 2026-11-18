import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { recordComputedMetrics } from '../../isms/documents/metric-automation';

/**
 * Close-of-period snapshot of the 9.1 metrics Comp AI computes itself. Runs on
 * the 1st of every month and records values for the period that just ended
 * (monthly metrics every month; quarterly metrics once their quarter has
 * passed, which the "previous period" lookup handles). Never overwrites a
 * period that already has a measurement.
 */
export async function recordIsmsMetricsForAllOrgs(now = new Date()) {
  const documents = await db.ismsDocument.findMany({
    where: { type: 'monitoring' },
    select: { id: true, organizationId: true },
  });
  let recorded = 0;
  for (const document of documents) {
    try {
      const result = await recordComputedMetrics({
        documentId: document.id,
        organizationId: document.organizationId,
        now,
        period: 'previous',
      });
      recorded += result.count;
    } catch (error) {
      // One org's failure must not stop the others.
      logger.error('Failed to record ISMS metrics', {
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Recorded computed ISMS metrics', {
    documents: documents.length,
    recorded,
  });
  return { documents: documents.length, recorded };
}

export const recordIsmsMetricsSchedule = schedules.task({
  id: 'record-isms-metrics-schedule',
  cron: '0 3 1 * *', // 03:00 UTC on the 1st of each month
  maxDuration: 30 * 60,
  run: () => recordIsmsMetricsForAllOrgs(),
});
