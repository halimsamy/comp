import { describe, expect, it } from 'vitest';
import { matchesCompliance, taskCompletionFrom, tracks, type MemberCompliance } from './people-compliance';

const entry = (overall: MemberCompliance['overall'], items: MemberCompliance['items'] = []): MemberCompliance => ({
  member: { id: 'mem_1', name: 'Ada', email: 'ada@acme.com', department: 'it', offboardDate: null, deactivated: false, former: false },
  items,
  overall,
  completedItems: 0,
  totalItems: 0,
});

describe('people compliance helpers', () => {
  it('filters by overall compliance status', () => {
    expect(matchesCompliance({ entry: entry('overdue'), filter: 'attention' })).toBe(true);
    expect(matchesCompliance({ entry: entry('complete'), filter: 'attention' })).toBe(false);
    expect(matchesCompliance({ entry: entry('expired'), filter: 'expired' })).toBe(true);
    expect(matchesCompliance({ entry: undefined, filter: 'complete' })).toBe(false);
    expect(matchesCompliance({ entry: undefined, filter: 'all' })).toBe(true);
  });

  it('builds the policy and training counts from the compliance items', () => {
    const e = entry('incomplete', [
      { key: 'policies', title: 'Policies', status: 'incomplete', detail: '', completed: 1, total: 3 },
      { key: 'training', title: 'Training', status: 'not_required', detail: '' },
    ]);
    expect(taskCompletionFrom(e)).toEqual({
      completed: 1,
      total: 3,
      policies: { completed: 1, total: 3 },
      training: { completed: 0, total: 0 },
    });
    expect(tracks({ entries: [e], key: 'policies' })).toBe(true);
    expect(tracks({ entries: [e], key: 'training' })).toBe(false);
  });
});
