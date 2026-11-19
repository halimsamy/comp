/**
 * Evidence task progress, counted one way everywhere (#7, #125): the overview
 * and the Getting Started guide. Callers pass non-archived tasks only. Not
 * relevant tasks are out of the denominator and reported on their own.
 */
export function countTaskProgress(
  tasks: Array<{ status: string; count?: number }>,
): { total: number; done: number; notRelevant: number } {
  let total = 0;
  let done = 0;
  let notRelevant = 0;
  for (const task of tasks) {
    const n = task.count ?? 1;
    if (task.status === 'not_relevant') {
      notRelevant += n;
      continue;
    }
    total += n;
    if (task.status === 'done') done += n;
  }
  return { total, done, notRelevant };
}
