import { describe, expect, it } from 'vitest';
import {
  defaultNextReviewDate,
  getPolicyLifecycle,
  reviewDateToIso,
} from './policy-lifecycle-state';

const now = new Date('2026-11-18T12:00:00Z');
const base = { status: 'published', pendingVersionId: null, now };

describe('getPolicyLifecycle', () => {
  it('is a draft before first publish', () => {
    expect(getPolicyLifecycle({ ...base, status: 'draft', reviewDate: null }).stage).toBe('draft');
  });

  it('is pending approval while a version awaits approval, even if review is overdue', () => {
    const state = getPolicyLifecycle({
      ...base,
      status: 'needs_review',
      pendingVersionId: 'pv_2',
      reviewDate: '2026-01-01',
    });
    expect(state.stage).toBe('pending_approval');
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

  it('derives review due from the date, never from the stored status', () => {
    // Legacy rows the old scheduler flagged stay in force until the date passes.
    expect(getPolicyLifecycle({ ...base, status: 'needs_review', reviewDate: null }).stage).toBe(
      'published',
    );
    expect(getPolicyLifecycle({ ...base, reviewDate: '2026-11-01' }).stage).toBe('review_due');
  });

  it('completes the cycle when a review was recorded after the last publish', () => {
    const state = getPolicyLifecycle({
      ...base,
      reviewDate: '2027-11-01',
      lastPublishedAt: '2026-01-01',
      lastReviewedAt: '2026-10-01',
    });
    expect(state).toMatchObject({ reviewDoneThisCycle: true, stepIndex: 4 });
    expect(
      getPolicyLifecycle({
        ...base,
        reviewDate: '2027-11-01',
        lastPublishedAt: '2026-10-02',
        lastReviewedAt: '2026-10-01',
      }).reviewDoneThisCycle,
    ).toBe(false);
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

describe('reviewDateToIso', () => {
  it('round-trips the picked day as UTC midnight', () => {
    const iso = reviewDateToIso('2027-03-01');
    expect(iso).toBe('2027-03-01T00:00:00.000Z');
    expect(new Date(iso).toISOString().slice(0, 10)).toBe('2027-03-01');
  });
});
