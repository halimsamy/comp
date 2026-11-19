import type { FrameworkScores } from '@/lib/control-compliance';
import { describe, expect, it } from 'vitest';
import type { ControlItem, RequirementItem } from './framework-controls-shared';
import { filterControlItems, filterRequirementItems, ownerOptions } from './table-filters';

const control = (id: string, owner: { id: string; name: string; deactivated?: boolean } | null) =>
  ({
    control: {
      id,
      name: id,
      owner: owner && { id: owner.id, deactivated: owner.deactivated ?? false, user: { name: owner.name, email: '' } },
    },
    requirements: [],
  }) as unknown as ControlItem;

const items = [control('c1', { id: 'm1', name: 'Ada' }), control('c2', null), control('c3', { id: 'm2', name: 'Bob', deactivated: true })];
const scores = {
  controls: {
    c1: { status: 'completed' },
    c2: { status: 'in_progress' },
    c3: { status: 'not_applicable' },
  },
} as unknown as FrameworkScores;

describe('filterControlItems', () => {
  it('filters by owner, treating departed owners as unassigned', () => {
    const ids = (owner: string) =>
      filterControlItems({ items, scores, owner, status: 'all' }).map((i) => i.control.id);
    expect(ids('m1')).toEqual(['c1']);
    expect(ids('unassigned')).toEqual(['c2', 'c3']);
  });

  it('"incomplete" keeps controls that still need work', () => {
    expect(
      filterControlItems({ items, scores, owner: 'all', status: 'incomplete' }).map((i) => i.control.id),
    ).toEqual(['c2']);
  });

  it('lists only active owners as options', () => {
    expect(ownerOptions(items)).toEqual([{ value: 'm1', label: 'Ada' }]);
  });
});

describe('filterRequirementItems', () => {
  const reqs = [
    { id: 'r1', status: 'satisfied', applicability: 'applicable' },
    { id: 'r2', status: 'in_progress', applicability: 'compensating_control' },
    { id: 'r3', status: 'not_applicable', applicability: 'not_applicable' },
  ] as unknown as RequirementItem[];

  it('filters by status ("open" = not satisfied and in scope) and applicability', () => {
    const ids = (status: string, applicability = 'all') =>
      filterRequirementItems({ items: reqs, status, applicability }).map((r) => r.id);
    expect(ids('open')).toEqual(['r2']);
    expect(ids('all', 'not_applicable')).toEqual(['r3']);
    expect(ids('satisfied', 'applicable')).toEqual(['r1']);
  });
});
