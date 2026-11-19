// Type-only: callers' tests mock '@db' without the generated enums.
import type { TaskAutomationStatus, TaskFrequency, TaskStatus } from '@db';

const MONTHS: Partial<Record<TaskFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannually: 6,
  yearly: 12,
};

/**
 * Next due date for a task completed at `from`. `Task.reviewDate` always holds
 * this value, so the overdue check is simply `reviewDate <= now`.
 * Tasks without a frequency default to a yearly review.
 */
export function computeNextTaskReviewDate(
  frequency: TaskFrequency | null | undefined,
  from: Date = new Date(),
): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const d = from.getDate();
  if (frequency === 'daily') return new Date(y, m, d + 1);
  if (frequency === 'weekly') return new Date(y, m, d + 7);
  const months = (frequency && MONTHS[frequency]) ?? 12;
  // Clamp to the target month's last day (Aug 31 + 6 months → Feb 28/29).
  const lastDay = new Date(y, m + months + 1, 0).getDate();
  return new Date(y, m + months, Math.min(d, lastDay));
}

/** Days an open task has before it is due: on create and on reopen (#4). */
export const OPEN_TASK_DUE_DAYS = 30;

/** Due date for a task that is created or reopened at `from`. */
export function openTaskDueDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + OPEN_TASK_DUE_DAYS * 24 * 60 * 60 * 1000);
}

/** A done or not-relevant task moving back to open work gets a fresh due date. */
export function isReopen({ from, to }: { from: TaskStatus; to: TaskStatus }): boolean {
  const closed = (s: TaskStatus) => s === 'done' || s === 'not_relevant';
  return closed(from) && !closed(to);
}

/** Fields to write when a task is completed (by a person or an automation). */
export function completedTaskData(
  frequency: TaskFrequency | null | undefined,
  now: Date = new Date(),
): { status: 'done'; reviewDate: Date; lastCompletedAt: Date } {
  return {
    status: 'done',
    reviewDate: computeNextTaskReviewDate(frequency, now),
    lastCompletedAt: now,
  };
}

/**
 * What an automation may do with a task whose checks all pass. A MANUAL task
 * still needs human evidence (sign-off, review notes), so passing checks only
 * attach results and move it to review; a person completes it.
 */
export function autoCompleteTaskData(
  task: {
    frequency: TaskFrequency | null;
    automationStatus: TaskAutomationStatus;
  },
  now: Date = new Date(),
):
  | { status: 'in_review' }
  | { status: 'done'; reviewDate: Date; lastCompletedAt: Date } {
  if (task.automationStatus === 'MANUAL') {
    return { status: 'in_review' };
  }
  return completedTaskData(task.frequency, now);
}

/**
 * Whether passing automations may (re)complete a task: open tasks, and done
 * tasks past their due date (the passing run re-proves them and moves the due
 * date on). Never a person's in-review or not-relevant decision.
 */
export function canAutoComplete(
  task: { status: TaskStatus; reviewDate: Date | null },
  now: Date = new Date(),
): boolean {
  if (task.status === 'in_review' || task.status === 'not_relevant') return false;
  if (task.status !== 'done') return true;
  return !task.reviewDate || task.reviewDate <= now;
}
