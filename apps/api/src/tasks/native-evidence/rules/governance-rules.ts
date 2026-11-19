import { db, type IsmsDocumentType } from '@db';
import { IsmsNonconformityService } from '../../../isms/isms-nonconformity.service';
import {
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  type NativeEvidenceRule,
} from '../native-evidence.types';

/** ISO 27001 10.2: no overdue corrective action, and closed ones had their effectiveness reviewed. */
export const correctiveActionRule: NativeEvidenceRule = {
  key: 'isms_corrective_actions',
  module: 'ISMS',
  title: 'No nonconformity is past its due date, and every one closed in the last 12 months had its effectiveness reviewed',
  reference: 'ISO/IEC 27001:2022 10.2; PCI DSS v4.0.1 12.4.2',
  path: '/documents/isms/nonconformities',
  async evaluate({ organizationId, now }) {
    const { data: rows } = await new IsmsNonconformityService().list({ organizationId });
    const since = monthsBefore({ date: now, months: 12 });
    const overdue = rows.filter((r) => r.status !== 'closed' && r.dueDate && r.dueDate < now);
    // Auditor findings are closed in the auditor's own review workflow.
    const unreviewed = rows.filter(
      (r) => r.kind !== 'external_finding' && r.status === 'closed' && r.createdAt >= since && !r.effectivenessReviewedAt,
    );
    return {
      holds: overdue.length === 0 && unreviewed.length === 0,
      summary: `${rows.filter((r) => r.status !== 'closed').length} open nonconformities, ${overdue.length} overdue`,
      issues: [
        ...listIssue({ label: 'Past due', names: overdue.map((r) => r.reference) }),
        ...listIssue({ label: 'Closed without an effectiveness review', names: unreviewed.map((r) => r.reference) }),
      ],
      fingerprint: fingerprintOf(rows.map((r) => [r.id, r.status, r.dueDate, r.effectivenessReviewedAt])),
      sections: [
        {
          heading: 'Nonconformity and corrective action register',
          emptyText: 'No nonconformities recorded.',
          ...(rows.length > 0 && {
            table: {
              headers: ['Ref', 'Source', 'Status', 'Due', 'Effectiveness reviewed'],
              rows: rows.map((r) => [
                r.reference,
                r.source.replace(/_/g, ' '),
                r.status.replace(/_/g, ' '),
                formatDate(r.dueDate),
                formatDate(r.effectivenessReviewedAt),
              ]),
            },
          }),
        },
      ],
    };
  },
};

async function publishedDoc({ organizationId, type }: { organizationId: string; type: IsmsDocumentType }) {
  const doc = await db.ismsDocument.findFirst({
    where: { organizationId, type },
    select: { id: true, title: true, currentVersion: { select: { id: true, version: true, publishedAt: true } } },
  });
  return { title: doc?.title ?? type, version: doc?.currentVersion?.publishedAt ? doc.currentVersion : null };
}

async function loadRoleAssignments({ organizationId, roleKey }: { organizationId: string; roleKey?: string }) {
  const assignments = await db.ismsRoleAssignment.findMany({
    where: { role: { document: { organizationId }, ...(roleKey && { roleKey }) } },
    select: { memberId: true, acknowledgedAt: true, role: { select: { name: true } } },
  });
  const members = await db.member.findMany({
    where: { organizationId, id: { in: assignments.map((a) => a.memberId) }, deactivated: false },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const nameOf = new Map(members.map((m) => [m.id, m.user.name || m.user.email]));
  return assignments
    .filter((a) => nameOf.has(a.memberId))
    .map((a) => ({ role: a.role.name, name: nameOf.get(a.memberId) ?? '', acknowledgedAt: a.acknowledgedAt }));
}

const ackTable = (rows: Awaited<ReturnType<typeof loadRoleAssignments>>) => ({
  headers: ['Role', 'Person', 'Acknowledged'],
  rows: rows.map((a) => [a.role, a.name, formatDate(a.acknowledgedAt)]),
});

/** ISO 27001 5.3, 6.2, 7.4: roles and objectives approved and every role holder acknowledged. */
export const communicationPlanRule: NativeEvidenceRule = {
  key: 'isms_communication_plan',
  module: 'ISMS',
  title: 'Roles (5.3) and objectives (6.2) are approved and every role holder acknowledged their role',
  reference: 'ISO/IEC 27001:2022 5.3, 6.2, 7.4',
  path: '/documents/isms',
  async evaluate({ organizationId }) {
    const [roles, objectives, assignments] = await Promise.all([
      publishedDoc({ organizationId, type: 'roles_and_responsibilities' }),
      publishedDoc({ organizationId, type: 'objectives_plan' }),
      loadRoleAssignments({ organizationId }),
    ]);
    const unacked = assignments.filter((a) => !a.acknowledgedAt);
    const docs = [roles, objectives];
    return {
      holds: !!roles.version && !!objectives.version && assignments.length > 0 && unacked.length === 0,
      summary: `${docs.filter((d) => d.version).length} of 2 documents approved; ${assignments.length - unacked.length} of ${assignments.length} roles acknowledged`,
      issues: [
        ...docs.filter((d) => !d.version).map((d) => `Approve and publish “${d.title}” in ISMS.`),
        ...(assignments.length ? [] : ['Assign people to the ISMS roles (5.3).']),
        ...listIssue({ label: 'Role not acknowledged', names: unacked.map((a) => `${a.name} (${a.role})`) }),
      ],
      fingerprint: fingerprintOf([docs.map((d) => d.version?.id ?? null), assignments.map((a) => [a.name, a.acknowledgedAt])]),
      sections: [
        {
          heading: 'Approved documents',
          table: {
            headers: ['Document', 'Version', 'Approved on'],
            rows: docs.map((d) => [d.title, d.version ? `v${d.version.version}` : '—', formatDate(d.version?.publishedAt)]),
          },
        },
        { heading: 'Role acknowledgements', emptyText: 'No roles assigned.', ...(assignments.length > 0 && { table: ackTable(assignments) }) },
      ],
    };
  },
};

/** PCI DSS 12.4.1: an executive is accountable for PCI DSS and every PCI control has an owner. */
export const pciExecutiveRule: NativeEvidenceRule = {
  key: 'pci_executive_accountability',
  module: 'ISMS',
  title: 'The PCI executive owner role is assigned and acknowledged, and every PCI DSS control has an owner',
  reference: 'PCI DSS v4.0.1 12.4.1, 12.4.2; ISO/IEC 27001:2022 5.3',
  path: '/documents/isms',
  async evaluate({ organizationId }) {
    const [execs, controls] = await Promise.all([
      loadRoleAssignments({ organizationId, roleKey: 'pci_executive_owner' }),
      db.control.findMany({
        where: {
          organizationId,
          requirementsMapped: {
            some: { frameworkInstance: { framework: { name: { contains: 'PCI', mode: 'insensitive' } } } },
          },
        },
        select: { id: true, name: true, ownerId: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const acked = execs.filter((e) => e.acknowledgedAt);
    const unowned = controls.filter((c) => !c.ownerId);
    return {
      holds: acked.length > 0 && controls.length > 0 && unowned.length === 0,
      summary: `${execs.length ? execs.map((e) => e.name).join(', ') : 'No one'} accountable; ${controls.length - unowned.length} of ${controls.length} PCI controls owned`,
      issues: [
        ...(execs.length ? [] : ['Assign the PCI executive owner role in ISMS > Roles (5.3).']),
        ...(execs.length && !acked.length ? ['The PCI executive owner has not acknowledged the role yet.'] : []),
        ...listIssue({ label: 'PCI controls without an owner', names: unowned.map((c) => c.name) }),
      ],
      fingerprint: fingerprintOf([execs.map((e) => [e.name, e.acknowledgedAt]), controls.map((c) => [c.id, c.ownerId])]),
      sections: [
        { heading: 'PCI DSS executive accountability', emptyText: 'Role not assigned.', ...(execs.length > 0 && { table: ackTable(execs) }) },
        {
          heading: 'PCI DSS control ownership',
          keyValues: [
            { label: 'PCI DSS controls', value: String(controls.length) },
            { label: 'Without an owner', value: String(unowned.length) },
          ],
        },
      ],
    };
  },
};

/** ISO 27001 A.5.24, A.5.30; PCI DSS 12.10.2: an incident response test (tabletop) in 12 months. */
export const tabletopRule: NativeEvidenceRule = {
  key: 'forms_tabletop_exercise',
  module: 'Documents',
  title: 'An incident response tabletop exercise was recorded in the last 12 months',
  reference: 'ISO/IEC 27001:2022 A.5.24, A.5.29, A.5.30; PCI DSS v4.0.1 12.10.2',
  path: '/documents/tabletop-exercise',
  async evaluate({ organizationId, now }) {
    const latest = await db.evidenceSubmission.findFirst({
      where: { organizationId, formType: 'tabletop_exercise', status: { not: 'rejected' } },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, submittedAt: true, status: true, submittedBy: { select: { name: true, email: true } } },
    });
    const holds = !!latest && latest.submittedAt >= monthsBefore({ date: now, months: 12 });
    return {
      holds,
      summary: latest ? `Tabletop exercise recorded ${formatDate(latest.submittedAt)}` : 'No tabletop exercise recorded',
      issues: holds ? [] : ['Run this year’s exercise and submit the Incident Response Tabletop Exercise form in Documents.'],
      fingerprint: fingerprintOf(['tabletop', latest?.id ?? null]),
      sections: [
        {
          heading: 'Incident response tabletop exercise',
          keyValues: [
            { label: 'Submitted on', value: formatDate(latest?.submittedAt) },
            { label: 'Submitted by', value: latest?.submittedBy ? latest.submittedBy.name || latest.submittedBy.email : '—' },
            { label: 'Review status', value: latest?.status ?? '—' },
          ],
        },
      ],
    };
  },
};
