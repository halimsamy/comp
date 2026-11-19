import { describe, expect, it } from 'vitest';
import { isPolicyReviewDue, shouldNotifyReviewDue } from './policy-schedule-helpers';

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

describe('shouldNotifyReviewDue', () => {
  const reviewDate = new Date('2026-11-01T00:00:00.000Z');
  const hoursAfter = (h: number) => new Date(reviewDate.getTime() + h * 3_600_000);

  it('notifies on the first run after the due date, then once a week', () => {
    expect(shouldNotifyReviewDue({ reviewDate, now: hoursAfter(-1) })).toBe(false);
    expect(shouldNotifyReviewDue({ reviewDate, now: hoursAfter(1) })).toBe(true);
    expect(shouldNotifyReviewDue({ reviewDate, now: hoursAfter(13) })).toBe(false);
    expect(shouldNotifyReviewDue({ reviewDate, now: hoursAfter(7 * 24 + 1) })).toBe(true);
  });

  it('never notifies without a review date', () => {
    expect(shouldNotifyReviewDue({ reviewDate: null, now: hoursAfter(1) })).toBe(false);
  });
});
