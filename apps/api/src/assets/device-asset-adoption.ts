import { db } from '@db';

function groupBy<T>(items: T[], key: (item: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k) groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

/**
 * A newly seen device takes over its owner's hand-added computer asset instead
 * of the sync creating a duplicate. The asset keeps its name, CDE scope,
 * classification and description. Only unambiguous pairs are linked: the
 * owner has exactly one unlinked device and exactly one active manual computer.
 */
export async function adoptManualComputers({
  organizationId,
  devices,
}: {
  organizationId: string;
  devices: { id: string; memberId: string }[];
}): Promise<number> {
  const linked = await db.asset.findMany({
    where: { organizationId, source: 'device' },
    select: { externalId: true },
  });
  const known = new Set(linked.map((a) => a.externalId));
  const fresh = groupBy(
    devices.filter((d) => !known.has(d.id)),
    (d) => d.memberId,
  );
  if (fresh.size === 0) return 0;
  const manual = await db.asset.findMany({
    where: {
      organizationId,
      source: 'manual',
      type: 'computer',
      archivedAt: null,
      ownerId: { in: [...fresh.keys()] },
    },
    select: { id: true, ownerId: true },
  });
  let adopted = 0;
  for (const [ownerId, assets] of groupBy(manual, (a) => a.ownerId)) {
    const ownerDevices = fresh.get(ownerId) ?? [];
    if (assets.length !== 1 || ownerDevices.length !== 1) continue;
    await db.asset.update({
      where: { id: assets[0].id },
      data: {
        source: 'device',
        externalId: ownerDevices[0].id,
        resourceType: 'device',
      },
    });
    adopted++;
  }
  return adopted;
}
