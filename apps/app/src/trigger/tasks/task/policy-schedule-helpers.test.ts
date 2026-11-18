import { describe, expect, it } from 'vitest';
import { isPolicyReviewDue } from './policy-schedule-helpers';

describe('isPolicyReviewDue', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('is due once the next-review date has passed', () => {
    expect(isPolicyReviewDue({ reviewDate: new Date('2026-11-18T11:59:59Z'), now })).toBe(true);
  });

  it('is not due before the next-review date', () => {
    // Regression: the old check added another full cycle on top of the due
    // date, so annual reviews were only flagged after two years.
    expect(isPolicyReviewDue({ reviewDate: new Date('2026-12-01T00:00:00Z'), now })).toBe(false);
  });

  it('is never due without a review date', () => {
    expect(isPolicyReviewDue({ reviewDate: null, now })).toBe(false);
  });
});
