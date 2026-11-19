import { filterComplianceMembers } from '../utils/compliance-filters';
import { isFormerMember } from './checklist-progress';
import { roleTrainingItem, trainingItem, type ComplianceStatus } from './compliance-items';
import { loadNativeStates } from './member-native-state';

/**
 * Security awareness and role-based training across the organization (#3, #189),
 * for the overview card and the training register. In scope = current members
 * with the compliance obligation.
 */
export async function trainingStatusForOrg(organizationId: string, now = new Date()) {
  const states = (await loadNativeStates({ organizationId, now })).filter(
    (s) => !isFormerMember(s.member, now),
  );
  const obliged = new Set(
    (await filterComplianceMembers(states.map((s) => s.member), organizationId)).map((m) => m.id),
  );
  const members = states
    .filter((s) => obliged.has(s.member.id))
    .map((state) => {
      const general = trainingItem(state);
      const role = state.training.modules.length > 0 ? roleTrainingItem(state) : null;
      const statuses: ComplianceStatus[] = [general.status, ...(role ? [role.status] : [])].filter(
        (s) => s !== 'not_required',
      );
      const status: ComplianceStatus | 'not_required' =
        statuses.length === 0
          ? 'not_required'
          : statuses.every((s) => s === 'complete')
            ? 'complete'
            : statuses.includes('expired')
              ? 'expired'
              : 'incomplete';
      return {
        memberId: state.member.id,
        name: state.member.user.name,
        email: state.member.user.email,
        status,
        neverTrained:
          state.training.generalCompleted === 0 &&
          !state.training.hipaaCompletedAt &&
          !state.training.hadExpiredCycle &&
          state.training.modules.every((m) => m.status === 'not_started'),
        completedAt: general.completedAt,
        expiresAt: general.expiresAt,
      };
    });
  const required = members.filter((m) => m.status !== 'not_required');
  return {
    inScope: required.length,
    trained: required.filter((m) => m.status === 'complete').length,
    expired: required.filter((m) => m.status === 'expired').length,
    neverTrained: required.filter((m) => m.neverTrained).length,
    members,
  };
}
