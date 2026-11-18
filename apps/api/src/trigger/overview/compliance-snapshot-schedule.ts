import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { recordComplianceSnapshots } from '../../overview/compliance-snapshots';

/** Writes today's per-framework compliance score for every org with a framework. */
export async function recordComplianceSnapshotsForAllOrgs(now = new Date()) {
  const organizations = await db.organization.findMany({
    where: { hasAccess: true, frameworkInstances: { some: {} } },
    select: { id: true },
  });
  let snapshots = 0;
  for (const organization of organizations) {
    try {
      snapshots += await recordComplianceSnapshots({
        organizationId: organization.id,
        now,
      });
    } catch (error) {
      // One org's failure must not stop the others.
      logger.error('Failed to record compliance snapshot', {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Recorded compliance snapshots', {
    organizations: organizations.length,
    snapshots,
  });
  return { organizations: organizations.length, snapshots };
}

export const complianceSnapshotSchedule = schedules.task({
  id: 'compliance-snapshot-schedule',
  cron: '30 2 * * *', // 02:30 UTC daily
  maxDuration: 30 * 60,
  run: () => recordComplianceSnapshotsForAllOrgs(),
});
