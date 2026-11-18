import { db } from '@db';
import { GENERAL_TRAINING_VIDEO_IDS } from '@trycompai/company';
import { filterComplianceMembers } from '../../../utils/compliance-filters';
import { humanize, toCsv, type RegisterParams } from './register-csv';

const TRAINING_IDS = new Set<string>(GENERAL_TRAINING_VIDEO_IDS);

function personStatus(member: {
  deactivated: boolean;
  offboardDate: Date | null;
}) {
  if (member.offboardDate) return 'Offboarded';
  return member.deactivated ? 'Deactivated' : 'Active';
}

/**
 * The people population an auditor samples from (ISO 27001 A.6.1-A.6.5, 7.2/7.3;
 * PCI DSS 12.6, 12.7): every member with joiner/leaver dates and the status of
 * each personnel-security obligation.
 */
export async function buildPeopleRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const [members, requiredPolicies, devices] = await Promise.all([
    db.member.findMany({
      where: { organizationId },
      include: {
        user: { select: { name: true, email: true, role: true } },
        employeeTrainingVideoCompletion: {
          where: { completedAt: { not: null } },
          select: { videoId: true, completedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.policy.findMany({
      where: {
        organizationId,
        isRequiredToSign: true,
        status: 'published',
        isArchived: false,
      },
      select: { name: true, signedBy: true },
    }),
    db.device.findMany({
      where: { organizationId },
      select: { memberId: true, isCompliant: true },
    }),
  ]);

  const memberIds = members.map((m) => m.id);
  const [backgroundChecks, inScope] = await Promise.all([
    db.backgroundCheckRequest.findMany({
      where: { organizationId, memberId: { in: memberIds } },
      select: { memberId: true, status: true, updatedAt: true },
      // Oldest first, so the Map below keeps each member's latest check.
      orderBy: { updatedAt: 'asc' },
    }),
    filterComplianceMembers(members, organizationId),
  ]);
  const checkByMember = new Map(backgroundChecks.map((c) => [c.memberId, c]));
  const inScopeIds = new Set(inScope.map((m) => m.id));

  return toCsv({
    headers: [
      'Member ID',
      'Name',
      'Email',
      'Roles',
      'Department',
      'Job title',
      'Status',
      'In compliance scope',
      'Joined',
      'Left',
      'Required policies signed',
      'Unsigned policies',
      'Security training completed',
      'Training completed on',
      'Background check',
      'Background check updated',
      'Devices',
      'Compliant devices',
    ],
    rows: members.map((member) => {
      const unsigned = requiredPolicies.filter(
        (p) => !p.signedBy.includes(member.id),
      );
      const training = member.employeeTrainingVideoCompletion.filter((c) =>
        TRAINING_IDS.has(c.videoId),
      );
      const trainingDone = training.length >= TRAINING_IDS.size;
      const lastTraining = training
        .map((c) => c.completedAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const check = checkByMember.get(member.id);
      const backgroundCheck = member.backgroundCheckExempt
        ? `Exempt${member.backgroundCheckExemptReason ? ` (${member.backgroundCheckExemptReason})` : ''}`
        : check
          ? humanize(check.status)
          : 'Not started';
      const memberDevices = devices.filter((d) => d.memberId === member.id);

      return [
        member.id,
        member.user.name,
        member.user.email,
        member.role,
        member.department === 'none' ? '' : humanize(member.department),
        member.jobTitle,
        personStatus(member),
        inScopeIds.has(member.id),
        member.onboardDate ?? member.createdAt,
        member.offboardDate,
        `${requiredPolicies.length - unsigned.length}/${requiredPolicies.length}`,
        unsigned.map((p) => p.name).join('; '),
        `${training.length}/${TRAINING_IDS.size}`,
        trainingDone ? lastTraining : null,
        backgroundCheck,
        check?.updatedAt,
        memberDevices.length,
        memberDevices.filter((d) => d.isCompliant).length,
      ];
    }),
  });
}
