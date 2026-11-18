import { PolicyReviewsService } from './policy-reviews.service';

jest.mock('@db', () => ({
  db: {
    policy: { findFirst: jest.fn(), update: jest.fn() },
    policyReview: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
  PolicyStatus: {
    draft: 'draft',
    published: 'published',
    needs_review: 'needs_review',
  },
  Frequency: { monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');

const basePolicy = {
  id: 'pol_1',
  status: 'needs_review',
  frequency: 'yearly',
  isArchived: false,
  archivedAt: null,
  currentVersionId: 'pv_3',
  pendingVersionId: null,
};

describe('PolicyReviewsService', () => {
  const service = new PolicyReviewsService();

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(
      (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    );
    db.policyReview.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: 'prv_1', ...(data as object) }),
    );
  });

  it('records a review without touching content or acknowledgements', async () => {
    db.policy.findFirst.mockResolvedValue(basePolicy);

    const review = await service.record({
      policyId: 'pol_1',
      organizationId: 'org_1',
      reviewerId: 'mem_1',
      notes: '  Still accurate  ',
    });

    expect(review).toMatchObject({
      policyVersionId: 'pv_3',
      reviewerId: 'mem_1',
      notes: 'Still accurate',
    });
    const update = db.policy.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'pol_1' });
    expect(update.data.status).toBe('published');
    expect(update.data.reviewDate.getTime()).toBeGreaterThan(Date.now());
    expect(update.data).not.toHaveProperty('signedBy');
    expect(update.data).not.toHaveProperty('content');
  });

  it('clears the current sign-offs when re-acknowledgement is requested', async () => {
    db.policy.findFirst.mockResolvedValue(basePolicy);

    await service.record({
      policyId: 'pol_1',
      organizationId: 'org_1',
      reviewerId: 'mem_1',
      requireReacknowledgement: true,
    });

    expect(db.policy.update.mock.calls[0][0].data.signedBy).toEqual([]);
  });

  it('scopes the policy lookup to the organization', async () => {
    db.policy.findFirst.mockResolvedValue(null);
    await expect(
      service.record({
        policyId: 'pol_other',
        organizationId: 'org_1',
        reviewerId: 'mem_1',
      }),
    ).rejects.toThrow(/not found/);
    expect(db.policy.findFirst.mock.calls[0][0].where).toEqual({
      id: 'pol_other',
      organizationId: 'org_1',
    });
  });

  it('uses the requested next review date', async () => {
    db.policy.findFirst.mockResolvedValue(basePolicy);
    const next = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
    await service.record({
      policyId: 'pol_1',
      organizationId: 'org_1',
      reviewerId: 'mem_1',
      nextReviewDate: next,
    });
    expect(db.policy.update.mock.calls[0][0].data.reviewDate).toEqual(next);
  });

  it('rejects a next review date in the past', async () => {
    db.policy.findFirst.mockResolvedValue(basePolicy);
    await expect(
      service.record({
        policyId: 'pol_1',
        organizationId: 'org_1',
        reviewerId: 'mem_1',
        nextReviewDate: new Date('2020-01-01'),
      }),
    ).rejects.toThrow(/future/);
  });

  it.each([
    [{ status: 'draft' }, /published/],
    [{ pendingVersionId: 'pv_4' }, /pending approval/],
    [{ isArchived: true }, /Archived/],
  ])('rejects reviews for %o', async (overrides, message) => {
    db.policy.findFirst.mockResolvedValue({ ...basePolicy, ...overrides });
    await expect(
      service.record({
        policyId: 'pol_1',
        organizationId: 'org_1',
        reviewerId: 'mem_1',
      }),
    ).rejects.toThrow(message);
    expect(db.policyReview.create).not.toHaveBeenCalled();
  });

  it('requires a signed-in reviewer', async () => {
    await expect(
      service.record({ policyId: 'pol_1', organizationId: 'org_1' }),
    ).rejects.toThrow(/signed-in member/);
  });

  it('lists reviews scoped to the organization', async () => {
    db.policy.findFirst.mockResolvedValue(basePolicy);
    db.policyReview.findMany.mockResolvedValue([]);
    await service.list({ policyId: 'pol_1', organizationId: 'org_1' });
    expect(db.policyReview.findMany.mock.calls[0][0].where).toEqual({
      policyId: 'pol_1',
      organizationId: 'org_1',
    });
  });
});

describe('computeNextReviewDate', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { computeNextReviewDate } = require('./review-date');
  const monthsAhead = (date: Date) => {
    const now = new Date();
    return (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
  };

  it.each([
    ['monthly', 1],
    ['quarterly', 3],
    ['semiannually', 6],
    ['yearly', 12],
    [null, 12],
  ])('%s reviews are due %i months out', (frequency, months) => {
    expect(monthsAhead(computeNextReviewDate(frequency))).toBe(months);
  });
});
