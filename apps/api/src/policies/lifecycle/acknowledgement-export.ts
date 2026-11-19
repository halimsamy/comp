import { db } from '@db';
import {
  getAcknowledgementAudience,
  toAcknowledgementsCsv,
  type AcknowledgementCsvRow,
} from './acknowledgement-audience';
import { isPolicyInForce } from './lifecycle-stage';

const personName = (person: { user: { name: string | null; email: string } } | null) =>
  person ? person.user.name || person.user.email : '';

/**
 * Acknowledgement evidence (PCI DSS 12.1.1 / 12.6.3): one row per audience
 * member per policy, including who has not signed yet. Without a policyId
 * every in-force policy that requires sign-off is exported.
 */
export async function exportAcknowledgementsCsv({
  organizationId,
  policyId,
  memberId,
}: {
  organizationId: string;
  policyId?: string;
  memberId?: string;
}) {
  const policies = (
    await db.policy.findMany({
      where: {
        organizationId,
        isArchived: false,
        archivedAt: null,
        ...(policyId ? { id: policyId } : { isRequiredToSign: true }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        lastPublishedAt: true,
        signedBy: true,
        visibility: true,
        visibleToDepartments: true,
        currentVersionId: true,
        assignee: { select: { user: { select: { name: true, email: true } } } },
        currentVersion: {
          select: {
            version: true,
            approvedAt: true,
            approvedBy: { select: { user: { select: { name: true, email: true } } } },
          },
        },
      },
    })
  ).filter((policy) => policyId || isPolicyInForce(policy));
  const policyIds = policies.map((policy) => policy.id);

  const [audience, history, reminders] = await Promise.all([
    getAcknowledgementAudience({
      organizationId,
      policy: { visibility: 'ALL', visibleToDepartments: [] },
    }),
    db.policyAcknowledgement.findMany({
      where: { organizationId, policyId: { in: policyIds }, ...(memberId ? { memberId } : {}) },
      orderBy: { acknowledgedAt: 'desc' },
      select: {
        policyId: true,
        memberId: true,
        policyVersionId: true,
        acknowledgedAt: true,
        policyVersion: { select: { version: true } },
      },
    }),
    db.policyAckReminder.groupBy({
      by: ['policyId', 'memberId'],
      where: { policyId: { in: policyIds }, ...(memberId ? { memberId } : {}) },
      _max: { sentAt: true },
    }),
  ]);
  const lastReminded = new Map(
    reminders.map((r) => [`${r.policyId}:${r.memberId}`, r._max.sentAt ?? null]),
  );

  const rows: AcknowledgementCsvRow[] = [];
  for (const policy of policies) {
    const members = audience.filter(
      (member) =>
        (!memberId || member.id === memberId) &&
        (policy.visibility !== 'DEPARTMENT' ||
          policy.visibleToDepartments.includes(member.department)),
    );
    for (const member of members) {
      const own = history.filter(
        (row) => row.policyId === policy.id && row.memberId === member.id,
      );
      const signed = policy.signedBy.includes(member.id);
      const current = own.find((row) => row.policyVersionId === policy.currentVersionId);
      const shown = signed ? (current ?? own[0]) : own[0];
      rows.push({
        policyName: policy.name,
        memberName: member.user.name || member.user.email,
        memberEmail: member.user.email,
        department: member.department,
        role: member.role,
        status: signed ? 'Acknowledged' : own.length ? 'Outdated' : 'Pending',
        currentVersion: policy.currentVersion?.version ?? null,
        acknowledgedVersion: shown?.policyVersion?.version ?? null,
        acknowledgedAt: shown?.acknowledgedAt ?? null,
        lastRemindedAt: lastReminded.get(`${policy.id}:${member.id}`) ?? null,
        owner: personName(policy.assignee),
        approvedBy: personName(policy.currentVersion?.approvedBy ?? null),
        approvedAt: policy.currentVersion?.approvedAt ?? null,
      });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  return {
    filename: `policy-acknowledgements-${date}.csv`,
    count: rows.length,
    csv: toAcknowledgementsCsv(rows),
  };
}
