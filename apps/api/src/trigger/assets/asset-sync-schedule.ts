import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { AssetSyncService } from '../../assets/asset-sync.service';
import { CheckRunRepository } from '../../integration-platform/repositories/check-run.repository';
import { ConnectionRepository } from '../../integration-platform/repositories/connection.repository';
import { CheckResultsService } from '../../integration-platform/services/check-results.service';

/**
 * Daily, after the 06:00 integration checks: rebuilds every organization's
 * asset inventory and integration vulnerabilities from the latest results.
 */
export const assetSyncSchedule = schedules.task({
  id: 'asset-sync-schedule',
  cron: '0 8 * * *',
  maxDuration: 60 * 60,
  run: async () => {
    const sync = new AssetSyncService(
      new CheckResultsService(
        new CheckRunRepository(),
        new ConnectionRepository(),
      ),
    );
    const organizations = await db.organization.findMany({
      where: {
        OR: [
          {
            integrationConnections: {
              some: { status: { not: 'disconnected' } },
            },
          },
          { devices: { some: {} } },
          { assets: { some: {} } },
        ],
      },
      select: { id: true },
    });

    let synced = 0;
    let failed = 0;
    for (const { id } of organizations) {
      try {
        await sync.syncOrganization(id);
        synced++;
      } catch (error) {
        failed++;
        logger.error('Asset sync failed', {
          organizationId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    logger.info('Asset sync complete', { synced, failed });
    return { synced, failed };
  },
});
