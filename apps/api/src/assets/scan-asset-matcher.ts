import { db, type AssetCdeScope } from '@db';
import type { ImportedFinding } from './vulnerability-import';

interface MatchedAsset {
  id: string;
  ownerId: string | null;
}

/**
 * Links imported scan rows to inventory assets by IP, DNS name, host,
 * externalId or name (case-insensitive). A host nothing matches becomes a
 * manual asset so the finding is never orphaned (PCI DSS 11.3: every scanned
 * system belongs in the 12.5.1 inventory). Matched assets get `lastScannedAt`.
 */
export async function createScanAssetMatcher({
  organizationId,
  unmatchedScope,
}: {
  organizationId: string;
  /** ASV targets face the internet next to the CDE: connected; others unassessed. */
  unmatchedScope: AssetCdeScope;
}) {
  const assets = await db.asset.findMany({
    where: { organizationId, archivedAt: null },
    select: { id: true, name: true, externalId: true, ownerId: true },
  });
  const byKey = new Map<string, MatchedAsset>();
  for (const asset of assets) {
    byKey.set(asset.name.toLowerCase(), asset);
    byKey.set(asset.externalId.toLowerCase(), asset);
  }
  const touched = new Set<string>();

  const match = async (
    finding: Pick<ImportedFinding, 'hosts' | 'resource'>,
  ): Promise<MatchedAsset | null> => {
    const keys = [finding.resource.toLowerCase(), ...finding.hosts];
    const hit = keys.map((key) => byKey.get(key)).find(Boolean);
    if (hit) {
      touched.add(hit.id);
      return hit;
    }
    const host = finding.hosts[0];
    if (!host) return null;
    const created = await db.asset.upsert({
      where: {
        organizationId_source_externalId: {
          organizationId,
          source: 'manual',
          externalId: `scan-host:${host}`,
        },
      },
      create: {
        organizationId,
        source: 'manual',
        externalId: `scan-host:${host}`,
        name: host,
        type: 'other',
        cdeScope: unmatchedScope,
        description: 'Added from a vulnerability scan import',
      },
      update: { archivedAt: null },
      select: { id: true, ownerId: true },
    });
    for (const key of finding.hosts) byKey.set(key, created);
    touched.add(created.id);
    return created;
  };

  const stampScanned = async (scannedAt: Date) => {
    if (touched.size === 0) return;
    await db.asset.updateMany({
      where: {
        organizationId,
        id: { in: [...touched] },
        OR: [{ lastScannedAt: null }, { lastScannedAt: { lt: scannedAt } }],
      },
      data: { lastScannedAt: scannedAt },
    });
  };

  return { match, stampScanned };
}
