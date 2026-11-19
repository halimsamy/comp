import { describe, expect, it } from 'vitest';
import { computePoliciesOverview, UNASSIGNED_ID } from './compute-overview';

const owner = { id: 'mem_1', user: { name: 'Olivia' } };
const base = { isArchived: false, assigneeId: null, assignee: null };

describe('computePoliciesOverview', () => {
  it('counts lifecycle stages and an Unassigned owner bar', () => {
    const overview = computePoliciesOverview([
      { ...base, id: 'a', status: 'needs_review', pendingVersionId: 'pv_1' },
      { ...base, id: 'b', status: 'published', reviewDate: '2000-01-01', assignee: owner, assigneeId: 'mem_1' },
      { ...base, id: 'c', status: 'published', lifecycleStage: 'published', assignee: owner, assigneeId: 'mem_1' },
      { ...base, id: 'd', status: 'draft' },
      { ...base, id: 'e', status: 'published', isArchived: true },
    ]);

    expect(overview.byStage).toEqual({
      pending_approval: 1,
      review_due: 1,
      published: 1,
      draft: 1,
      archived: 1,
    });
    const unassigned = overview.assigneeData.find((o) => o.id === UNASSIGNED_ID);
    expect(unassigned).toMatchObject({ name: 'Unassigned', total: 2 });
    expect(overview.assigneeData.find((o) => o.id === 'mem_1')).toMatchObject({ total: 2, review_due: 1 });
  });
});
