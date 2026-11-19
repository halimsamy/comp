/**
 * Task due dates (#4, #41): `Task.reviewDate` is the due date of open work.
 * Done / not-relevant tasks have no due date, their reviewDate is when they recur.
 */

export type TaskDueState = 'overdue' | 'due_soon' | 'scheduled' | 'no_due' | 'closed';
export type TaskDueFilter = 'overdue' | 'due_soon' | 'no_due';

/** "Due soon" window, the same 14 days the overview deadline queue uses. */
export const DUE_SOON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type DueTask = { status: string; reviewDate: Date | string | null };

const isClosed = (status: string) => status === 'done' || status === 'not_relevant';

export function taskDueState({ task, now = new Date() }: { task: DueTask; now?: Date }): TaskDueState {
  if (isClosed(task.status)) return 'closed';
  if (!task.reviewDate) return 'no_due';
  const left = new Date(task.reviewDate).getTime() - now.getTime();
  if (left < 0) return 'overdue';
  return left <= DUE_SOON_DAYS * DAY_MS ? 'due_soon' : 'scheduled';
}

export function countTaskDue({ tasks, now = new Date() }: { tasks: DueTask[]; now?: Date }) {
  const counts = { overdue: 0, due_soon: 0, no_due: 0 };
  for (const task of tasks) {
    const state = taskDueState({ task, now });
    if (state === 'overdue' || state === 'due_soon' || state === 'no_due') counts[state] += 1;
  }
  return counts;
}

export function isTaskDueFilter(value: string | null): value is TaskDueFilter {
  return value === 'overdue' || value === 'due_soon' || value === 'no_due';
}

/** Earliest due first; closed and undated tasks last, then by title. */
export function compareTasksByDue(a: DueTask & { title: string }, b: DueTask & { title: string }): number {
  const dueOf = (t: DueTask) =>
    !isClosed(t.status) && t.reviewDate ? new Date(t.reviewDate).getTime() : Number.POSITIVE_INFINITY;
  const diff = dueOf(a) - dueOf(b);
  if (diff !== 0 && Number.isFinite(diff)) return diff;
  if (dueOf(a) !== dueOf(b)) return Number.isFinite(dueOf(a)) ? -1 : 1;
  return a.title.localeCompare(b.title);
}
