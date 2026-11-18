import type { ControlOverview } from '@/hooks/use-controls-overview';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  filterControls,
  filterOptions,
  NEEDS_REASSIGNMENT,
  summarizeControls,
  UNASSIGNED,
} from './controls-overview';
import { CONTROLS, tally } from './controls-overview.fixtures';

const ids = (controls: ControlOverview[]) => controls.map((c) => c.id);

describe('filterControls', () => {
  it('searches names and requirement codes', () => {
    expect(ids(filterControls({ controls: CONTROLS, filters: { ...EMPTY_FILTERS, search: '7.2.1' } }))).toEqual(['ctl_access']);
    expect(ids(filterControls({ controls: CONTROLS, filters: { ...EMPTY_FILTERS, search: 'context' } }))).toEqual(['ctl_context']);
  });

  it('filters by framework (short name), owner and status', () => {
    const run = (patch: Partial<typeof EMPTY_FILTERS>) =>
      ids(filterControls({ controls: CONTROLS, filters: { ...EMPTY_FILTERS, ...patch } }));
    expect(run({ framework: 'PCI DSS' })).toEqual(['ctl_access']);
    expect(run({ framework: 'ISO 27001' })).toEqual(['ctl_access', 'ctl_context']);
    expect(run({ owner: UNASSIGNED })).toEqual(['ctl_custom']);
    expect(run({ owner: NEEDS_REASSIGNMENT })).toEqual(['ctl_context']);
    expect(run({ owner: 'mem_ada' })).toEqual(['ctl_access']);
    expect(run({ status: 'completed' })).toEqual(['ctl_context']);
  });
});

describe('filterOptions', () => {
  it('lists frameworks and owners once, sorted', () => {
    expect(filterOptions(CONTROLS)).toEqual({
      frameworks: ['ISO 27001', 'PCI DSS'],
      owners: [
        { id: 'mem_ada', name: 'Ada' },
        { id: 'mem_bob', name: 'Bob' },
      ],
    });
  });
});

describe('summarizeControls', () => {
  it('counts assignment, completion and evidence per type', () => {
    expect(summarizeControls(CONTROLS)).toEqual({
      total: 3,
      assigned: 1,
      needsReassignment: 1,
      unassigned: 1,
      completed: 1,
      evidence: {
        policies: tally(1, 1),
        tasks: tally(1, 2),
        forms: tally(0, 0),
        ismsDocuments: tally(1, 1),
      },
    });
  });
});
