import type { ControlScoreStatus, FrameworkScores, RequirementScoreStatus } from '@/lib/control-compliance';
import { getControlScore } from '@/lib/control-compliance';
import type { ControlItem, RequirementItem } from './framework-controls-shared';

export const ALL = 'all';
export const UNASSIGNED = 'unassigned';

/** "incomplete" = still needs work: anything not completed and not out of scope. */
export type ControlStatusFilter = typeof ALL | 'incomplete' | ControlScoreStatus;
/** "open" = not yet satisfied and in scope. */
export type RequirementStatusFilter = typeof ALL | 'open' | RequirementScoreStatus;

const DONE_OR_OUT: ReadonlySet<string> = new Set(['completed', 'not_relevant', 'not_applicable']);
const REQ_DONE_OR_OUT: ReadonlySet<string> = new Set(['satisfied', 'not_relevant', 'not_applicable']);

export const ownerName = (item: ControlItem) => {
  const owner = item.control.owner;
  return owner && !owner.deactivated ? owner.user.name || owner.user.email : null;
};

export function filterControlItems({
  items,
  scores,
  owner,
  status,
}: {
  items: ControlItem[];
  scores: FrameworkScores | null | undefined;
  owner: string;
  status: string;
}): ControlItem[] {
  return items.filter((item) => {
    const activeOwner = item.control.owner && !item.control.owner.deactivated ? item.control.owner.id : null;
    if (owner === UNASSIGNED && activeOwner) return false;
    if (owner !== ALL && owner !== UNASSIGNED && activeOwner !== owner) return false;
    if (status === ALL) return true;
    const controlStatus = getControlScore(scores, item.control.id).status;
    return status === 'incomplete' ? !DONE_OR_OUT.has(controlStatus) : controlStatus === status;
  });
}

export function filterRequirementItems({
  items,
  status,
  applicability,
}: {
  items: RequirementItem[];
  status: string;
  applicability: string;
}): RequirementItem[] {
  return items.filter((item) => {
    if (applicability !== ALL && item.applicability !== applicability) return false;
    if (status === ALL) return true;
    return status === 'open' ? !REQ_DONE_OR_OUT.has(item.status) : item.status === status;
  });
}

/** Owner options from the controls themselves (only people who own something). */
export function ownerOptions(items: ControlItem[]): { value: string; label: string }[] {
  const owners = new Map<string, string>();
  for (const item of items) {
    const name = ownerName(item);
    if (name && item.control.owner) owners.set(item.control.owner.id, name);
  }
  return [...owners.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
