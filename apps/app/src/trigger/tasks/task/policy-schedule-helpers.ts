/** Policy.reviewDate is the next-review due date, not the last review date. */
export function isPolicyReviewDue({
  reviewDate,
  now,
}: {
  reviewDate: Date | null;
  now: Date;
}): boolean {
  return reviewDate !== null && reviewDate.getTime() <= now.getTime();
}

const HOUR_MS = 60 * 60 * 1000;
/** The schedule runs every 12 hours. */
export const POLICY_SCHEDULE_INTERVAL_MS = 12 * HOUR_MS;
const REVIEW_DUE_REPEAT_MS = 7 * 24 * HOUR_MS;

/**
 * The job never writes a status (review due is derived from reviewDate), so
 * it must not re-notify every run: it notifies in the run right after the
 * due date passes, then once a week while the review stays overdue.
 */
export function shouldNotifyReviewDue({
  reviewDate,
  now,
}: {
  reviewDate: Date | null;
  now: Date;
}): boolean {
  if (!isPolicyReviewDue({ reviewDate, now }) || !reviewDate) return false;
  const overdueMs = now.getTime() - reviewDate.getTime();
  return overdueMs % REVIEW_DUE_REPEAT_MS < POLICY_SCHEDULE_INTERVAL_MS;
}
