import { describe, expect, it } from 'vitest';
import { defaultNextReviewDate, getPolicyLifecycle } from './policy-lifecycle-state';

const now = new Date('2026-11-18T12:00:00Z');
const base = { status: 'published', pendingVersionId: null, approverId: null, now };

describe('getPolicyLifecycle', () => {
  it('is a draft before first publish', () => {
    expect(getPolicyLifecycle({ ...base, status: 'draft', reviewDate: null }).stage).toBe('draft');
  });

  it('is in review while a version awaits approval, even if review is overdue', () => {
    const state = getPolicyLifecycle({
      ...base,
      status: 'needs_review',
      pendingVersionId: 'pv_2',
      approverId: 'mem_1',
      reviewDate: '2026-01-01',
    });
    expect(state.stage).toBe('in_review');
    expect(state.canRecordReview).toBe(false);
  });

  it('is published with a future review date', () => {
    const state = getPolicyLifecycle({ ...base, reviewDate: '2027-11-18T12:00:00Z' });
    expect(state).toMatchObject({ stage: 'published', stepIndex: 2, isReviewDueSoon: false });
    expect(state.daysUntilReview).toBe(365);
  });

  it('warns 30 days before the review is due', () => {
    expect(getPolicyLifecycle({ ...base, reviewDate: '2026-12-10T12:00:00Z' }).isReviewDueSoon).toBe(
      true,
    );
  });

  it('is due for review when flagged or past the date', () => {
    expect(getPolicyLifecycle({ ...base, status: 'needs_review', reviewDate: null }).stage).toBe(
      'review_due',
    );
    expect(getPolicyLifecycle({ ...base, reviewDate: '2026-11-01' }).stage).toBe('review_due');
  });
});

describe('defaultNextReviewDate', () => {
  it('follows the review frequency', () => {
    const date = new Date(2026, 10, 18);
    expect(defaultNextReviewDate({ frequency: 'yearly', now: date })).toBe('2027-11-18');
    expect(defaultNextReviewDate({ frequency: 'quarterly', now: date })).toBe('2027-02-18');
    expect(defaultNextReviewDate({ frequency: 'semiannually', now: date })).toBe('2027-05-18');
    expect(defaultNextReviewDate({ frequency: null, now: date })).toBe('2027-11-18');
  });
});
