import type { Frequency } from '@db';

const REVIEW_CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannually: 6,
  yearly: 12,
};

/** Policy.reviewDate holds the date the next review is due (default: yearly). */
export function computeNextReviewDate(frequency: Frequency | null | undefined): Date {
  const now = new Date();
  const months = (frequency && REVIEW_CYCLE_MONTHS[frequency]) || 12;
  return new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
}
