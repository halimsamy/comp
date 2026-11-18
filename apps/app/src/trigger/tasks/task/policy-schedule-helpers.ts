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
