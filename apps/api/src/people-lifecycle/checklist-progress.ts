import type { ChecklistKind } from '@db';
import { autoCompletion, type MemberNativeState } from './member-native-state';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Checklist targeting (#91): empty lists mean everyone. */
export function appliesToMember({
  item,
  member,
}: {
  item: { appliesToRoles?: string[] | null; appliesToDepartments?: string[] | null };
  member: { role: string; department: string };
}): boolean {
  const roles = member.role
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const targetRoles = item.appliesToRoles ?? [];
  const targetDepartments = item.appliesToDepartments ?? [];
  return (
    (targetRoles.length === 0 || targetRoles.some((r) => roles.includes(r))) &&
    (targetDepartments.length === 0 || targetDepartments.includes(member.department))
  );
}

interface ChecklistInput {
  completed: boolean;
  completion?: { completedAt: Date } | null;
  dueDays: number | null;
  autoCompleteSource: string | null;
}

/** SLA due dates and items completed from native state, for one member's checklist. */
export function decorateChecklist<T extends ChecklistInput>({
  items,
  state,
  kind,
  now,
}: {
  items: T[];
  state: MemberNativeState;
  kind: ChecklistKind;
  now: Date;
}) {
  const startDate =
    kind === 'onboarding'
      ? (state.member.onboardDate ?? state.member.createdAt)
      : state.member.offboardDate;
  const decorated = items.map((item) => {
    const auto = item.autoCompleteSource
      ? autoCompletion({ state, source: item.autoCompleteSource })
      : null;
    const completed = item.completed || !!auto?.done;
    const dueDate =
      item.dueDays !== null && startDate
        ? new Date(startDate.getTime() + item.dueDays * DAY_MS)
        : null;
    return {
      ...item,
      completed,
      completedAutomatically: !item.completed && !!auto?.done,
      completedAt: item.completion?.completedAt ?? auto?.completedAt ?? null,
      dueDate,
      // Due by the end of the due day.
      overdue: !completed && dueDate !== null && dueDate.getTime() + DAY_MS <= now.getTime(),
    };
  });
  return {
    kind,
    startDate,
    items: decorated,
    totalItems: decorated.length,
    completedItems: decorated.filter((i) => i.completed).length,
    overdueItems: decorated.filter((i) => i.overdue).length,
  };
}

/** Former members (left or deactivated) only owe the offboarding checklist. */
export function isFormerMember(
  member: { deactivated: boolean; offboardDate: Date | null },
  now: Date,
): boolean {
  return member.deactivated || (!!member.offboardDate && member.offboardDate.getTime() <= now.getTime());
}
