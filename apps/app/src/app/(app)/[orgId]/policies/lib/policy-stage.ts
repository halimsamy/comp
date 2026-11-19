export type PolicyLifecycleStage = 'draft' | 'pending_approval' | 'published' | 'review_due';

/**
 * Same rule as the API (`lifecycle-stage.ts`): a pending version wins, then
 * draft, then "review due" once the next-review date has passed.
 */
export function getPolicyStage({
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
  if (reviewDate && new Date(reviewDate).getTime() <= now.getTime()) return 'review_due';
  return 'published';
}

export const POLICY_STAGE_LABELS: Record<PolicyLifecycleStage, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  published: 'Published',
  review_due: 'Review due',
};

/** Badge classes: pending approval amber, review due red. */
export const POLICY_STAGE_BADGE_CLASS: Record<PolicyLifecycleStage | 'archived', string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  pending_approval: 'border-warning/40 bg-warning/10 text-warning',
  published: 'border-primary/30 bg-primary/10 text-primary',
  review_due: 'border-destructive/40 bg-destructive/10 text-destructive',
  archived: 'border-border bg-muted text-muted-foreground',
};

/** Chart colours, matching the badges. */
export const POLICY_STAGE_COLORS: Record<PolicyLifecycleStage | 'archived', string> = {
  published: 'var(--primary)',
  pending_approval: 'var(--warning)',
  review_due: 'var(--destructive)',
  draft: 'var(--muted-foreground)',
  archived: 'color-mix(in oklch, var(--muted-foreground) 40%, transparent)',
};
