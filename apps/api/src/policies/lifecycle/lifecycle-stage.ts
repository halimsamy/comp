export type PolicyLifecycleStage =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'review_due';

/**
 * Where a policy is in its lifecycle. `status` keeps three values, but
 * "needs_review" only means "waiting for approval" now; "review due" is
 * derived from the next-review date, never stored.
 */
export function getPolicyLifecycleStage({
  status,
  pendingVersionId,
  reviewDate,
  now = new Date(),
}: {
  status: string;
  pendingVersionId: string | null;
  reviewDate: Date | string | null;
  now?: Date;
}): PolicyLifecycleStage {
  if (pendingVersionId) return 'pending_approval';
  if (status === 'draft') return 'draft';
  if (reviewDate && new Date(reviewDate).getTime() <= now.getTime()) {
    return 'review_due';
  }
  // A needs_review row without a pending version is legacy data: treat it as in force.
  return 'published';
}

/**
 * Approved content is in force while a policy is published, and also while a
 * newer version waits for approval (needs_review after an earlier publish).
 */
export function isPolicyInForce({
  status,
  lastPublishedAt,
}: {
  status: string;
  lastPublishedAt: Date | string | null;
}): boolean {
  return status === 'published' || (status === 'needs_review' && Boolean(lastPublishedAt));
}
