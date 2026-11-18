import { describe, expect, it } from 'vitest';
import { getDigestFrequency, isDigestDue, selectDigestTasks } from './task-digest-helpers';

describe('task digest helpers', () => {
  it('defaults to weekly and reads daily', () => {
    expect(getDigestFrequency(null)).toBe('weekly');
    expect(getDigestFrequency({ weeklyTaskDigest: true })).toBe('weekly');
    expect(getDigestFrequency({ digestFrequency: 'daily' })).toBe('daily');
    expect(getDigestFrequency({ digestFrequency: 'hourly' })).toBe('weekly');
  });

  it('sends weekly digests on Mondays only and daily digests every day', () => {
    const monday = new Date('2026-11-16T09:00:00Z');
    const tuesday = new Date('2026-11-17T09:00:00Z');
    expect(isDigestDue({ frequency: 'weekly', now: monday })).toBe(true);
    expect(isDigestDue({ frequency: 'weekly', now: tuesday })).toBe(false);
    expect(isDigestDue({ frequency: 'daily', now: tuesday })).toBe(true);
  });

  it('gives members their own tasks and owners/admins the unassigned ones too', () => {
    const tasks = [
      { id: 't1', title: 'Mine', assigneeId: 'mem_1' },
      { id: 't2', title: 'Theirs', assigneeId: 'mem_2' },
      { id: 't3', title: 'Unowned', assigneeId: null },
    ];
    expect(selectDigestTasks({ tasks, memberId: 'mem_1', role: 'employee' }).map((t) => t.id)).toEqual([
      't1',
    ]);
    expect(selectDigestTasks({ tasks, memberId: 'mem_1', role: 'auditor,admin' }).map((t) => t.id)).toEqual([
      't1',
      't3',
    ]);
  });
});
