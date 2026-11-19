import { describe, expect, it } from 'vitest';
import { compareTasksByDue, countTaskDue, isTaskDueFilter, taskDueState } from './task-due';

const now = new Date('2026-11-19T12:00:00Z');
const task = (status: string, reviewDate: string | null, title = 't') => ({ status, reviewDate, title });

describe('task due dates', () => {
  it('classifies open work by its reviewDate and ignores closed tasks', () => {
    expect(taskDueState({ task: task('todo', '2026-11-01'), now })).toBe('overdue');
    expect(taskDueState({ task: task('in_progress', '2026-11-25'), now })).toBe('due_soon');
    expect(taskDueState({ task: task('todo', '2027-01-30'), now })).toBe('scheduled');
    expect(taskDueState({ task: task('failed', null), now })).toBe('no_due');
    expect(taskDueState({ task: task('done', '2026-01-01'), now })).toBe('closed');
    expect(taskDueState({ task: task('not_relevant', null), now })).toBe('closed');
  });

  it('counts overdue, due soon and undated open tasks', () => {
    const tasks = [
      task('todo', '2026-11-01'),
      task('in_review', '2026-11-20'),
      task('todo', null),
      task('done', null),
    ];
    expect(countTaskDue({ tasks, now })).toEqual({ overdue: 1, due_soon: 1, no_due: 1 });
  });

  it('sorts by earliest due date, undated and closed last, then by title', () => {
    const sorted = [
      task('todo', null, 'b'),
      task('done', '2026-01-01', 'a'),
      task('todo', '2026-12-01', 'c'),
      task('todo', '2026-11-21', 'd'),
    ].sort(compareTasksByDue);
    expect(sorted.map((t) => t.title)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('accepts only known due filters from the URL', () => {
    expect(isTaskDueFilter('overdue')).toBe(true);
    expect(isTaskDueFilter('later')).toBe(false);
    expect(isTaskDueFilter(null)).toBe(false);
  });
});
