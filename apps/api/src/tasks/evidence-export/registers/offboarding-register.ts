import { db } from '@db';
import { humanize, toCsv, type RegisterParams } from './register-csv';

/** One row per offboarded person (ISO 27001 A.5.11, A.5.18, A.6.5; PCI DSS 8.2.5). */
export async function buildOffboardingRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const [members, checklistSize] = await Promise.all([
    db.member.findMany({
      where: { organizationId, offboardDate: { not: null } },
      include: {
        user: { select: { name: true, email: true } },
        offboardingChecklistCompletions: {
          where: { templateItem: { isEnabled: true, kind: 'offboarding' } },
          select: { completedAt: true },
        },
        offboardingAccessRevocations: {
          select: { systemName: true, vendor: { select: { name: true } } },
        },
      },
      orderBy: { offboardDate: 'asc' },
    }),
    db.offboardingChecklistTemplate.count({
      where: { organizationId, isEnabled: true, kind: 'offboarding' },
    }),
  ]);

  return toCsv({
    headers: [
      'Member ID',
      'Name',
      'Email',
      'Department',
      'Offboarded on',
      'Checklist items completed',
      'Checklist completed on',
      'Vendor access revoked',
      'Vendors',
    ],
    rows: members.map((m) => {
      const done = m.offboardingChecklistCompletions;
      const lastDone = done
        .map((c) => c.completedAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return [
        m.id,
        m.user.name,
        m.user.email,
        m.department === 'none' ? '' : humanize(m.department),
        m.offboardDate,
        `${done.length}/${checklistSize}`,
        done.length >= checklistSize && checklistSize > 0 ? lastDone : null,
        m.offboardingAccessRevocations.length,
        m.offboardingAccessRevocations.map((r) => r.systemName ?? r.vendor?.name ?? '').join('; '),
      ];
    }),
  });
}
