'use client';

import { format } from 'date-fns';
import { countTaskDue, taskDueState, type TaskDueFilter } from './task-due';

type DueTask = { status: string; reviewDate: Date | string | null };

const CHIP_STYLES = {
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400',
  due_soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
  scheduled: 'bg-muted text-muted-foreground',
} as const;

/** "Due Dec 3" / "Overdue · Nov 2" chip on a task row; nothing for closed or undated tasks. */
export function TaskDueChip({ task }: { task: DueTask }) {
  const state = taskDueState({ task });
  if (state === 'closed' || state === 'no_due' || !task.reviewDate) return null;
  const date = format(new Date(task.reviewDate), 'MMM d');
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${CHIP_STYLES[state]}`}
    >
      {state === 'overdue' ? `Overdue · ${date}` : `Due ${date}`}
    </span>
  );
}

const COUNTERS: Array<{ key: TaskDueFilter; label: string; tone: string }> = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-600 dark:text-red-400' },
  { key: 'due_soon', label: 'Due in 14 days', tone: 'text-amber-600 dark:text-amber-400' },
  { key: 'no_due', label: 'No due date', tone: 'text-muted-foreground' },
];

/**
 * Overdue / Due soon / No due date counters over open evidence. Each counter
 * filters the list; "Sort by due" orders the list view by due date.
 */
export function TaskDueSummary({
  tasks,
  dueFilter,
  onDueFilterChange,
  sortByDue,
  onSortByDueChange,
}: {
  tasks: DueTask[];
  dueFilter: TaskDueFilter | null;
  onDueFilterChange: (value: TaskDueFilter | null) => void;
  sortByDue: boolean;
  onSortByDueChange: (value: boolean) => void;
}) {
  const counts = countTaskDue({ tasks });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {COUNTERS.map(({ key, label, tone }) => {
        const active = dueFilter === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onDueFilterChange(active ? null : key)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
              active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
          >
            <span className={`text-sm font-semibold tabular-nums ${counts[key] > 0 ? tone : 'text-muted-foreground'}`}>
              {counts[key]}
            </span>
            <span className="text-muted-foreground">{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={sortByDue}
        onClick={() => onSortByDueChange(!sortByDue)}
        className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition-colors sm:ml-auto ${
          sortByDue ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
        }`}
      >
        Sort by due date
      </button>
    </div>
  );
}
