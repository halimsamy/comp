import { db } from '@db';
import type { AccessAccountsService } from './access-accounts.service';

export const AUTO_REMEDIATION_NOTE =
  'Confirmed by the access inventory: the account is gone or disabled';

/**
 * #90: revocations are checked against the current inventory. A pending revoke
 * whose account is gone or disabled completes itself; a revoke marked done
 * whose account is still active is reported as "Revoked but still active".
 * Runs when a review is opened, after each manual import and from the daily job.
 * Returns the ids of revoked-but-still-active items.
 */
export async function reconcileRevocations({
  organizationId,
  accounts,
  reviewId,
  now = new Date(),
}: {
  organizationId: string;
  accounts: AccessAccountsService;
  /** Omit to check every open review of the organization. */
  reviewId?: string;
  now?: Date;
}): Promise<Set<string>> {
  const items = await db.accessReviewItem.findMany({
    where: {
      organizationId,
      decision: 'revoke',
      review: { status: 'in_progress', ...(reviewId && { id: reviewId }) },
    },
    select: {
      id: true,
      accountId: true,
      remediatedAt: true,
      reviewSystem: { select: { systemKey: true } },
    },
  });
  const stillActive = new Set<string>();
  if (items.length === 0) return stillActive;

  const activeBySystem = new Map<string, Set<string>>();
  for (const key of new Set(items.map((i) => i.reviewSystem.systemKey))) {
    try {
      const { accounts: current } = await accounts.getSystemAccounts({
        organizationId,
        systemKey: key,
      });
      activeBySystem.set(
        key,
        new Set(current.filter((a) => a.status === 'active').map((a) => a.accountId)),
      );
    } catch {
      // The system was removed or disconnected: nothing to compare against, leave items as they are.
    }
  }

  const gone: string[] = [];
  for (const item of items) {
    const active = activeBySystem.get(item.reviewSystem.systemKey);
    if (!active) continue;
    if (active.has(item.accountId)) {
      if (item.remediatedAt) stillActive.add(item.id);
    } else if (!item.remediatedAt) {
      gone.push(item.id);
    }
  }
  if (gone.length > 0) {
    await db.accessReviewItem.updateMany({
      where: { id: { in: gone }, organizationId, remediatedAt: null },
      data: { remediatedAt: now, remediationNote: AUTO_REMEDIATION_NOTE },
    });
  }
  return stillActive;
}
