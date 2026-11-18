import { describe, expect, it } from 'vitest';
import { checklistFixture } from './checklist-fixtures';
import { getMilestones } from './milestones';

describe('getMilestones', () => {
  it('summarises only the milestones present in the checklist', () => {
    expect(getMilestones(checklistFixture)).toEqual([
      { id: 'systems', label: 'key systems connected', done: 1, total: 2 },
      { id: 'policies', label: 'policy steps complete', done: 1, total: 2 },
      { id: 'auditor', label: 'auditor invited', done: 0, total: 1 },
    ]);
  });
});
