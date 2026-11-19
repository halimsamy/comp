import { db } from '@db';
import { GENERAL_TRAINING_VIDEO_IDS } from '@trycompai/company';
import { filterComplianceMembers } from '../../../utils/compliance-filters';
import {
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  personLabel,
  type NativeEvidenceRule,
} from '../native-evidence.types';

const VERIFIED_STATUSES = ['completed', 'completed_with_flags'];
const TRAINING_IDS = new Set<string>(GENERAL_TRAINING_VIDEO_IDS);

/** Active members with the compliance obligation (the population auditors sample). */
export async function loadScopeMembers(organizationId: string) {
  const members = await db.member.findMany({
    where: { organizationId, deactivated: false },
    select: {
      id: true,
      role: true,
      onboardDate: true,
      createdAt: true,
      backgroundCheckExempt: true,
      backgroundCheckExemptReason: true,
      user: { select: { name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return filterComplianceMembers(members, organizationId);
}

/** ISO 27001 A.6.1; PCI DSS 12.7.1: every joiner in the period is screened or exempt. */
export const employeeVerificationRule: NativeEvidenceRule = {
  key: 'people_employee_verification',
  module: 'People',
  title: 'Every person who joined in the last 12 months has a completed background check or an exemption',
  reference: 'ISO/IEC 27001:2022 A.6.1; PCI DSS v4.0.1 12.7.1',
  path: '/people',
  async evaluate({ organizationId, now }) {
    const since = monthsBefore({ date: now, months: 12 });
    const joiners = (await loadScopeMembers(organizationId)).filter(
      (m) => (m.onboardDate ?? m.createdAt) >= since,
    );
    const checks = await db.backgroundCheckRequest.findMany({
      where: { organizationId, memberId: { in: joiners.map((m) => m.id) } },
      select: { memberId: true, status: true, completedAt: true },
    });
    const checkOf = new Map(checks.map((c) => [c.memberId, c]));
    const rows = joiners.map((m) => {
      const check = checkOf.get(m.id);
      const verified = m.backgroundCheckExempt || (!!check && VERIFIED_STATUSES.includes(check.status));
      return { member: m, check, verified };
    });
    const missing = rows.filter((r) => !r.verified);

    return {
      holds: missing.length === 0,
      summary: joiners.length
        ? `${rows.length - missing.length} of ${rows.length} joiners verified`
        : 'No joiners in the last 12 months',
      issues: listIssue({
        label: 'Background check missing',
        names: missing.map((r) => r.member.user.name || r.member.user.email),
      }),
      fingerprint: fingerprintOf(
        rows.map((r) => [r.member.id, r.member.backgroundCheckExempt, r.check?.status ?? null]),
      ),
      sections: [
        {
          heading: 'Joiners and screening',
          intro: `People who joined between ${formatDate(since)} and ${formatDate(now)}, with the result of their pre-employment background check.`,
          emptyText: 'Nobody joined in this period.',
          ...(rows.length > 0 && {
            table: {
              headers: ['Person', 'Joined', 'Background check', 'Completed'],
              rows: rows.map(({ member, check }) => [
                personLabel(member.user),
                formatDate(member.onboardDate ?? member.createdAt),
                member.backgroundCheckExempt
                  ? `Exempt${member.backgroundCheckExemptReason ? `: ${member.backgroundCheckExemptReason}` : ''}`
                  : (check?.status.replace(/_/g, ' ') ?? 'Not started'),
                formatDate(check?.completedAt),
              ]),
            },
          }),
        },
      ],
    };
  },
};

/** ISO 27001 7.2, 7.3, A.6.3; PCI DSS 12.6.1, 12.6.3: training upon hire and every 12 months. */
export const securityTrainingRule: NativeEvidenceRule = {
  key: 'people_security_training',
  module: 'People',
  title: 'Every in-scope person completed security awareness training in the last 12 months',
  reference: 'ISO/IEC 27001:2022 7.2, 7.3, A.6.3; PCI DSS v4.0.1 12.6.1, 12.6.3',
  path: '/people',
  async evaluate({ organizationId, now }) {
    const since = monthsBefore({ date: now, months: 12 });
    const [org, members] = await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        select: { securityTrainingStepEnabled: true },
      }),
      loadScopeMembers(organizationId),
    ]);
    const completions = await db.employeeTrainingVideoCompletion.findMany({
      where: {
        memberId: { in: members.map((m) => m.id) },
        videoId: { in: [...TRAINING_IDS] },
        completedAt: { gte: since },
      },
      select: { memberId: true, completedAt: true },
    });
    const rows = members.map((m) => {
      const done = completions.filter((c) => c.memberId === m.id);
      const last = done
        .map((c) => c.completedAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return { member: m, count: done.length, last: last ?? null, complete: done.length >= TRAINING_IDS.size };
    });
    const missing = rows.filter((r) => !r.complete);
    const enabled = !!org?.securityTrainingStepEnabled;

    return {
      holds: enabled && rows.length > 0 && missing.length === 0,
      summary: `${rows.length - missing.length} of ${rows.length} people trained in the last 12 months`,
      issues: [
        ...(enabled ? [] : ['Security training is turned off in People settings.']),
        ...(rows.length ? [] : ['No people in compliance scope yet.']),
        ...listIssue({
          label: 'Training outstanding',
          names: missing.map((r) => r.member.user.name || r.member.user.email),
        }),
      ],
      fingerprint: fingerprintOf(rows.map((r) => [r.member.id, r.last])),
      sections: [
        {
          heading: 'Security awareness training',
          intro: `Completion of the ${TRAINING_IDS.size}-module security awareness course between ${formatDate(since)} and ${formatDate(now)}, for every active person in compliance scope.`,
          emptyText: 'No people in compliance scope.',
          ...(rows.length > 0 && {
            table: {
              headers: ['Person', 'Modules completed', 'Last completed', 'Status'],
              rows: rows.map((r) => [
                personLabel(r.member.user),
                `${r.count}/${TRAINING_IDS.size}`,
                formatDate(r.last),
                r.complete ? 'Complete' : 'Outstanding',
              ]),
            },
          }),
        },
      ],
    };
  },
};
