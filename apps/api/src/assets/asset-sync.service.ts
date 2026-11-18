import { Injectable, Logger } from '@nestjs/common';
import { db, type AssetSource, type Prisma } from '@db';
import { CheckResultsService } from '../integration-platform/services/check-results.service';
import {
  classifyEnvironment,
  classifyResourceType,
  displayNameFromResourceId,
} from './asset-classify';
import {
  integrationVulnerabilityKey,
  isVulnerabilityResult,
  vulnerabilityResourceKey,
} from './vulnerability-signals';
import {
  syncIntegrationVulnerabilities,
  type VulnerabilityCandidate,
} from './vulnerability-sync';

type SeenAsset = Omit<Prisma.AssetCreateManyInput, 'organizationId' | 'source'>;

const CHUNK = 1000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK)
    out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Builds the system inventory and the integration vulnerability store from
 * what the platform already knows: the latest result of every integration
 * check (one asset per distinct resource) and the enrolled devices.
 * Sync only creates rows and stamps first/last seen; owner, environment, CDE
 * scope and classification are set once at creation and then belong to people.
 */
@Injectable()
export class AssetSyncService {
  private readonly logger = new Logger(AssetSyncService.name);

  constructor(private readonly checkResults: CheckResultsService) {}

  async syncOrganization(
    organizationId: string,
  ): Promise<{ assets: number; vulnerabilities: number }> {
    const now = new Date();
    const pairs = await this.checkResults.listRanChecks(organizationId);
    const seen = new Map<string, SeenAsset>();
    const candidates = new Map<string, VulnerabilityCandidate>();
    const scannedPrefixes = new Set<string>();

    for (const pair of pairs) {
      const rows = await this.checkResults.getLatestResultsByCheck({
        organizationId,
        connectionId: pair.connectionId,
        checkId: pair.checkId,
      });
      if (rows.length > 0)
        scannedPrefixes.add(`${pair.connectionId}:${pair.checkId}`);
      for (const row of rows) {
        const type = classifyResourceType(row.resourceType);
        if (type && !seen.has(row.resourceId)) {
          const name = displayNameFromResourceId(row.resourceId);
          seen.set(row.resourceId, {
            externalId: row.resourceId,
            name,
            type,
            resourceType: row.resourceType,
            environment: classifyEnvironment(row.resourceId),
            connectionId: pair.connectionId,
            providerSlug: pair.providerSlug,
          });
        }
        if (isVulnerabilityResult({ checkId: pair.checkId, ...row })) {
          const externalId = integrationVulnerabilityKey({
            ...pair,
            resourceId: vulnerabilityResourceKey({
              checkId: pair.checkId,
              ...row,
            }),
          });
          candidates.set(externalId, {
            externalId,
            connectionId: pair.connectionId,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            title: row.title,
            description: row.description,
            severity: row.severity ?? 'medium',
            remediation: null,
          });
        }
      }
    }

    const integrationCount = await this.upsertAssets({
      organizationId,
      source: 'integration',
      assets: Array.from(seen.values()),
      now,
    });
    const deviceCount = await this.syncDevices({ organizationId, now });
    const vulnerabilities = await syncIntegrationVulnerabilities({
      organizationId,
      candidates: Array.from(candidates.values()),
      scannedPrefixes,
      now,
    });
    this.logger.log(
      `Asset sync for ${organizationId}: ${integrationCount + deviceCount} assets, ${vulnerabilities} open integration vulnerabilities`,
    );
    return { assets: integrationCount + deviceCount, vulnerabilities };
  }

  private async syncDevices({
    organizationId,
    now,
  }: {
    organizationId: string;
    now: Date;
  }): Promise<number> {
    const devices = await db.device.findMany({
      where: { organizationId },
      select: { id: true, name: true, hostname: true, memberId: true },
    });
    return this.upsertAssets({
      organizationId,
      source: 'device',
      now,
      assets: devices.map((device): SeenAsset => ({
        externalId: device.id,
        name: device.name || device.hostname,
        type: 'computer',
        resourceType: 'device',
        ownerId: device.memberId,
      })),
    });
  }

  /** Create new rows, refresh last-seen on present ones, archive the vanished. */
  private async upsertAssets({
    organizationId,
    source,
    assets,
    now,
  }: {
    organizationId: string;
    source: Extract<AssetSource, 'integration' | 'device'>;
    assets: SeenAsset[];
    now: Date;
  }): Promise<number> {
    const existing = await db.asset.findMany({
      where: { organizationId, source },
      select: { id: true, externalId: true, archivedAt: true },
    });
    const known = new Set(existing.map((a) => a.externalId));
    const present = new Set(assets.map((a) => a.externalId));

    for (const batch of chunks(
      assets.filter((a) => !known.has(a.externalId)),
    )) {
      await db.asset.createMany({
        data: batch.map((a) => ({
          ...a,
          organizationId,
          source,
          firstSeenAt: now,
          lastSeenAt: now,
        })),
        skipDuplicates: true,
      });
    }
    const refreshIds = existing
      .filter((a) => present.has(a.externalId))
      .map((a) => a.id);
    for (const batch of chunks(refreshIds)) {
      await db.asset.updateMany({
        where: { organizationId, id: { in: batch } },
        data: { lastSeenAt: now, archivedAt: null },
      });
    }
    const archiveIds = existing
      .filter((a) => !present.has(a.externalId) && !a.archivedAt)
      .map((a) => a.id);
    for (const batch of chunks(archiveIds)) {
      await db.asset.updateMany({
        where: { organizationId, id: { in: batch } },
        data: { archivedAt: now },
      });
    }
    return assets.length;
  }
}
