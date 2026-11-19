import { db, type ChecklistKind } from '@db';
import { seedChecklistDefaults } from '../offboarding-checklist/member-checklist';
import { filterComplianceMembers } from '../utils/compliance-filters';
import { appliesToMember, decorateChecklist, isFormerMember } from './checklist-progress';
import {
  backgroundCheckItem,
  checklistItem,
  deviceItem,
  overallStatus,
  policiesItem,
  roleTrainingItem,
  trainingItem,
  type ComplianceItem,
} from './compliance-items';
import { loadNativeStates, type MemberNativeState } from './member-native-state';

type Checklist = ReturnType<typeof decorateChecklist>;

/**
 * Every member's people compliance in a fixed number of queries. Usable from
 * Nest services and trigger jobs alike (People table, reminders, overview).
 */
export async function buildOrgCompliance({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}) {
  await Promise.all([
    seedChecklistDefaults(organizationId, 'onboarding'),
    seedChecklistDefaults(organizationId, 'offboarding'),
  ]);
  const [states, templates] = await Promise.all([
    loadNativeStates({ organizationId, now }),
    db.offboardingChecklistTemplate.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);
  const completions = await db.offboardingChecklistCompletion.findMany({
    where: { organizationId, memberId: { in: states.map((s) => s.member.id) } },
    select: { memberId: true, templateItemId: true, completedAt: true },
  });
  const checklistFor = (state: MemberNativeState, kind: ChecklistKind): Checklist => {
    const items = templates
      .filter((t) => t.kind === kind && appliesToMember({ item: t, member: state.member }))
      .map((t) => {
        const completion =
          completions.find((c) => c.memberId === state.member.id && c.templateItemId === t.id) ?? null;
        return { ...t, completed: !!completion, completion };
      });
    return decorateChecklist({ items, state, kind, now });
  };
  const obliged = new Set(
    (await filterComplianceMembers(states.map((s) => s.member), organizationId)).map((m) => m.id),
  );
  return (
    states
      // Members without the compliance obligation (auditors, platform admins) still owe offboarding.
      .filter((s) => obliged.has(s.member.id) || isFormerMember(s.member, now))
      .map((state) => {
        const former = isFormerMember(state.member, now);
        return summarize({
          state,
          former,
          onboarding: former ? null : checklistFor(state, 'onboarding'),
          offboarding: state.member.offboardDate ? checklistFor(state, 'offboarding') : null,
        });
      })
  );
}

export type MemberCompliance = ReturnType<typeof summarize>;

export function summarize({
  state,
  former,
  onboarding,
  offboarding,
}: {
  state: MemberNativeState;
  former: boolean;
  onboarding: Checklist | null;
  offboarding: Checklist | null;
}) {
  const offboardingItem = offboarding
    ? [checklistItem({ key: 'offboarding', title: 'Offboarding checklist', checklist: offboarding })]
    : [];
  const items: ComplianceItem[] = former
    ? offboardingItem
    : [
        policiesItem(state),
        trainingItem(state),
        ...(state.training.modules.length > 0 ? [roleTrainingItem(state)] : []),
        deviceItem(state),
        backgroundCheckItem(state),
        ...(onboarding
          ? [checklistItem({ key: 'onboarding', title: 'Onboarding checklist', checklist: onboarding })]
          : []),
        ...offboardingItem,
      ];
  const required = items.filter((i) => i.status !== 'not_required');
  const m = state.member;
  return {
    member: {
      id: m.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      department: m.department,
      joinedAt: m.createdAt,
      onboardDate: m.onboardDate,
      offboardDate: m.offboardDate,
      deactivated: m.deactivated,
      former,
    },
    items,
    overall: overallStatus(items),
    pendingPolicies: former ? [] : state.policies.pending,
    completedItems: required.filter((i) => i.status === 'complete').length,
    totalItems: required.length,
  };
}
