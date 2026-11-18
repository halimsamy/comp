// Enums only — avoid instantiating the DB client.
jest.mock('@db', () => jest.requireActual('@prisma/client'));

import { TaskAutomationStatus, TaskFrequency } from '@db';
import {
  autoCompleteTaskData,
  canAutoComplete,
  completedTaskData,
  computeNextTaskReviewDate,
} from './task-completion';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('computeNextTaskReviewDate', () => {
  it.each([
    [TaskFrequency.daily, day(2026, 1, 16)],
    [TaskFrequency.weekly, day(2026, 1, 22)],
    [TaskFrequency.monthly, day(2026, 2, 15)],
    [TaskFrequency.quarterly, day(2026, 4, 15)],
    [TaskFrequency.semiannually, day(2026, 7, 15)],
    [TaskFrequency.yearly, day(2027, 1, 15)],
    [null, day(2027, 1, 15)],
  ])('%s → %s', (frequency, expected) => {
    expect(computeNextTaskReviewDate(frequency, day(2026, 1, 15))).toEqual(expected);
  });

  it('clamps to the last day of a shorter month (Aug 31 + 6 months → Feb 28)', () => {
    expect(computeNextTaskReviewDate(TaskFrequency.semiannually, day(2026, 8, 31))).toEqual(
      day(2027, 2, 28),
    );
  });
});

describe('completedTaskData', () => {
  it('marks done, stamps lastCompletedAt and sets the next due date', () => {
    const now = day(2026, 3, 1);
    expect(completedTaskData(TaskFrequency.semiannually, now)).toEqual({
      status: 'done',
      lastCompletedAt: now,
      reviewDate: day(2026, 9, 1),
    });
  });
});

describe('autoCompleteTaskData', () => {
  const now = day(2026, 3, 1);

  it('completes an AUTOMATED task', () => {
    expect(
      autoCompleteTaskData(
        { frequency: TaskFrequency.quarterly, automationStatus: TaskAutomationStatus.AUTOMATED },
        now,
      ),
    ).toEqual({ status: 'done', lastCompletedAt: now, reviewDate: day(2026, 6, 1) });
  });

  it('sends a MANUAL task to review without completing it', () => {
    expect(
      autoCompleteTaskData(
        { frequency: TaskFrequency.quarterly, automationStatus: TaskAutomationStatus.MANUAL },
        now,
      ),
    ).toEqual({ status: 'in_review' });
  });
});

describe('canAutoComplete', () => {
  const now = day(2026, 3, 1);

  it.each(['todo', 'in_progress', 'failed'] as const)('allows an open (%s) task', (status) => {
    expect(canAutoComplete({ status, reviewDate: null }, now)).toBe(true);
  });

  it.each(['in_review', 'not_relevant'] as const)('never overrides %s', (status) => {
    expect(canAutoComplete({ status, reviewDate: day(2020, 1, 1) }, now)).toBe(false);
  });

  it('re-completes a done task only once it is due', () => {
    expect(canAutoComplete({ status: 'done', reviewDate: day(2026, 4, 1) }, now)).toBe(false);
    expect(canAutoComplete({ status: 'done', reviewDate: day(2026, 3, 1) }, now)).toBe(true);
    expect(canAutoComplete({ status: 'done', reviewDate: null }, now)).toBe(true);
  });
});
