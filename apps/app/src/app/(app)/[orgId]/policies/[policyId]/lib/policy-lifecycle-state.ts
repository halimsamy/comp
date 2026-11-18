export type PolicyLifecycleStage = 'draft' | 'in_review' | 'published' | 'review_due';

export const POLICY_LIFECYCLE_STEPS: { stage: PolicyLifecycleStage; label: string }[] = [
  { stage: 'draft', label: 'Draft' },
  { stage: 'in_review', label: 'In review' },
  { stage: 'published', label: 'Approved & published' },
  { stage: 'review_due', label: 'Periodic review' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Show "review due soon" this many days before the due date. */
export const REVIEW_DUE_SOON_DAYS = 30;

export function getPolicyLifecycle({
  status,
  pendingVersionId,
  approverId,
  reviewDate,
  now = new Date(),
}: {
  status: string;
  pendingVersionId: string | null;
  approverId: string | null;
  reviewDate: Date | string | null;
  now?: Date;
}) {
  const due = reviewDate ? new Date(reviewDate) : null;
  const daysUntilReview = due ? Math.ceil((due.getTime() - now.getTime()) / DAY_MS) : null;

  let stage: PolicyLifecycleStage = 'published';
  if (pendingVersionId && approverId) stage = 'in_review';
  else if (status === 'draft') stage = 'draft';
  else if (status === 'needs_review' || (daysUntilReview !== null && daysUntilReview <= 0)) {
    stage = 'review_due';
  }

  return {
    stage,
    stepIndex: POLICY_LIFECYCLE_STEPS.findIndex((step) => step.stage === stage),
    daysUntilReview,
    isReviewDueSoon:
      stage === 'published' &&
      daysUntilReview !== null &&
      daysUntilReview <= REVIEW_DUE_SOON_DAYS,
    canRecordReview: stage === 'published' || stage === 'review_due',
  };
}

const REVIEW_CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannually: 6,
  yearly: 12,
};

/** Default next review date for the review form, as yyyy-MM-dd. */
export function defaultNextReviewDate({
  frequency,
  now = new Date(),
}: {
  frequency: string | null;
  now?: Date;
}): string {
  const months = (frequency && REVIEW_CYCLE_MONTHS[frequency]) || 12;
  const next = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
