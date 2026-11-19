import { getPolicyStage, type PolicyLifecycleStage } from '../../lib/policy-stage';

export type { PolicyLifecycleStage };

export const POLICY_LIFECYCLE_STEPS: { stage: PolicyLifecycleStage; label: string }[] = [
  { stage: 'draft', label: 'Draft' },
  { stage: 'pending_approval', label: 'Pending approval' },
  { stage: 'published', label: 'Approved & published' },
  { stage: 'review_due', label: 'Periodic review' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Show "review due soon" this many days before the due date. */
export const REVIEW_DUE_SOON_DAYS = 30;

export function getPolicyLifecycle({
  status,
  pendingVersionId,
  reviewDate,
  lastPublishedAt = null,
  lastReviewedAt = null,
  now = new Date(),
}: {
  status: string;
  pendingVersionId: string | null;
  reviewDate: Date | string | null;
  lastPublishedAt?: Date | string | null;
  lastReviewedAt?: Date | string | null;
  now?: Date;
}) {
  const due = reviewDate ? new Date(reviewDate) : null;
  const daysUntilReview = due ? Math.ceil((due.getTime() - now.getTime()) / DAY_MS) : null;
  const stage = getPolicyStage({ status, pendingVersionId, reviewDate, now });
  // A review recorded after the current version was published closes this cycle.
  const reviewDoneThisCycle =
    stage === 'published' &&
    lastReviewedAt !== null &&
    (!lastPublishedAt || new Date(lastReviewedAt) >= new Date(lastPublishedAt));

  return {
    stage,
    stepIndex: reviewDoneThisCycle
      ? POLICY_LIFECYCLE_STEPS.length
      : POLICY_LIFECYCLE_STEPS.findIndex((step) => step.stage === stage),
    reviewDoneThisCycle,
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

/** The review form's yyyy-MM-dd as UTC midnight, so the PDF and API never shift a day. */
export function reviewDateToIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** True when a review was already recorded today (local calendar day). */
export function isSameDay(a: Date | string | null | undefined, b: Date = new Date()): boolean {
  if (!a) return false;
  const d = new Date(a);
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}
