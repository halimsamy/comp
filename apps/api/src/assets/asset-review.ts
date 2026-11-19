import { BadRequestException } from '@nestjs/common';
import { db, type AssetCdeScope } from '@db';

interface Actor {
  userId?: string;
  memberId?: string;
}

const SCOPE_LABEL: Record<AssetCdeScope, string> = {
  unassessed: 'not assessed',
  in_scope: 'in the CDE',
  connected: 'connected to the CDE',
  out_of_scope: 'out of scope',
};

/** Scope history for PCI DSS 12.5.2: who moved which asset in or out of scope, and why. */
export async function logScopeChange({
  organizationId,
  actor,
  asset,
  from,
  to,
  justification,
}: {
  organizationId: string;
  actor: Actor;
  asset: { id: string; name: string };
  from: AssetCdeScope;
  to: AssetCdeScope;
  justification: string | null;
}) {
  // API-key calls carry no user; the audit interceptor still records the request.
  if (!actor.userId) return;
  await db.auditLog.create({
    data: {
      organizationId,
      userId: actor.userId,
      memberId: actor.memberId ?? null,
      entityType: 'integration',
      entityId: asset.id,
      description: `Changed PCI DSS scope of asset "${asset.name}" from ${SCOPE_LABEL[from]} to ${SCOPE_LABEL[to]}${justification ? `: ${justification}` : ''}`,
      data: {
        action: 'asset_scope_changed',
        assetId: asset.id,
        from,
        to,
        justification,
      },
    },
  });
}

/**
 * "Mark inventory reviewed": stamps every active asset as confirmed by the
 * reviewer and records it in the audit log. This is the periodic inventory
 * review (PCI DSS 12.5.1) and the annual scope confirmation (12.5.2).
 */
export async function markInventoryReviewed({
  organizationId,
  actor,
  now = new Date(),
}: {
  organizationId: string;
  actor: Actor;
  now?: Date;
}) {
  if (!actor.userId || !actor.memberId) {
    throw new BadRequestException(
      'Sign in as a member of the organization to confirm the inventory review.',
    );
  }
  const where = { organizationId, archivedAt: null };
  const [reviewed, unassessed] = await db.$transaction([
    db.asset.updateMany({
      where,
      data: { lastReviewedAt: now, lastReviewedById: actor.memberId },
    }),
    db.asset.count({ where: { ...where, cdeScope: 'unassessed' } }),
  ]);
  await db.auditLog.create({
    data: {
      organizationId,
      userId: actor.userId,
      memberId: actor.memberId,
      entityType: 'integration',
      entityId: organizationId,
      description: `Reviewed the asset inventory and confirmed PCI DSS scope (${reviewed.count} assets)`,
      data: {
        action: 'asset_inventory_reviewed',
        assets: reviewed.count,
        unassessed,
        reviewedAt: now.toISOString(),
      },
    },
  });
  return reviewStatus(organizationId);
}

/** Latest inventory review: when, by whom. */
export async function reviewStatus(organizationId: string) {
  const latest = await db.asset.findFirst({
    where: { organizationId, archivedAt: null, lastReviewedAt: { not: null } },
    orderBy: { lastReviewedAt: 'desc' },
    select: { lastReviewedAt: true, lastReviewedById: true },
  });
  if (!latest?.lastReviewedAt)
    return { lastReviewedAt: null, reviewedBy: null };
  const member = latest.lastReviewedById
    ? await db.member.findFirst({
        where: { id: latest.lastReviewedById, organizationId },
        select: { id: true, user: { select: { name: true, email: true } } },
      })
    : null;
  return {
    lastReviewedAt: latest.lastReviewedAt,
    reviewedBy: member
      ? { id: member.id, name: member.user.name, email: member.user.email }
      : null,
  };
}
