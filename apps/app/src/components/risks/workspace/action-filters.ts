import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';

export const ACTION_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Completed' },
  { value: 'all', label: 'All' },
] as const;

export type ActionFilter = (typeof ACTION_FILTERS)[number]['value'];

const isClosed = (action: RiskTreatmentAction) =>
  action.status === 'done' || action.status === 'canceled';

export function matchesActionFilter({
  action,
  filter,
}: {
  action: RiskTreatmentAction;
  filter: ActionFilter;
}): boolean {
  if (filter === 'open') return !isClosed(action);
  if (filter === 'overdue') return action.isOverdue;
  if (filter === 'done') return action.status === 'done';
  return true;
}

/** Actions matching the status filter and owner ('all', 'none' for unassigned, or a member id). */
export function filterActions({
  actions,
  filter,
  ownerId,
}: {
  actions: RiskTreatmentAction[];
  filter: ActionFilter;
  ownerId: string;
}): RiskTreatmentAction[] {
  return actions.filter((action) => {
    if (!matchesActionFilter({ action, filter })) return false;
    if (ownerId === 'all') return true;
    if (ownerId === 'none') return !action.assignee;
    return action.assignee?.id === ownerId;
  });
}

export function countActions(actions: RiskTreatmentAction[]): Record<ActionFilter, number> {
  return {
    open: actions.filter((action) => matchesActionFilter({ action, filter: 'open' })).length,
    overdue: actions.filter((action) => action.isOverdue).length,
    done: actions.filter((action) => action.status === 'done').length,
    all: actions.length,
  };
}
