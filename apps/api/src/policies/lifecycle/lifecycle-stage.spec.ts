import { getPolicyLifecycleStage, isPolicyInForce } from './lifecycle-stage';

describe('getPolicyLifecycleStage', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const stage = (overrides: Partial<Parameters<typeof getPolicyLifecycleStage>[0]>) =>
    getPolicyLifecycleStage({ status: 'published', pendingVersionId: null, reviewDate: null, now, ...overrides });

  it('reports pending approval whenever a version waits for approval', () => {
    expect(stage({ status: 'needs_review', pendingVersionId: 'pv_1' })).toBe('pending_approval');
    expect(stage({ status: 'draft', pendingVersionId: 'pv_1' })).toBe('pending_approval');
  });

  it('keeps drafts as drafts even with an overdue review date', () => {
    expect(stage({ status: 'draft', reviewDate: new Date('2026-01-01') })).toBe('draft');
  });

  it('derives review due from the next review date', () => {
    expect(stage({ reviewDate: new Date('2026-11-18T12:00:00Z') })).toBe('review_due');
    expect(stage({ reviewDate: '2026-11-19T00:00:00Z' })).toBe('published');
  });

  it('treats legacy needs_review rows without a pending version as published', () => {
    expect(stage({ status: 'needs_review' })).toBe('published');
  });
});

describe('isPolicyInForce', () => {
  it('is in force when published, or pending after an earlier approval', () => {
    expect(isPolicyInForce({ status: 'published', lastPublishedAt: null })).toBe(true);
    expect(isPolicyInForce({ status: 'needs_review', lastPublishedAt: new Date() })).toBe(true);
    expect(isPolicyInForce({ status: 'needs_review', lastPublishedAt: null })).toBe(false);
    expect(isPolicyInForce({ status: 'draft', lastPublishedAt: new Date() })).toBe(false);
  });
});
