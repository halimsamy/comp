import { db } from '@db';
import {
  humanize,
  personName,
  toCsv,
  type RegisterParams,
} from './register-csv';

/** Audit findings / nonconformities with their status (ISO 27001 10.2, 9.2). */
export async function buildFindingsRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const findings = await db.finding.findMany({
    where: { organizationId },
    include: {
      task: { select: { title: true } },
      policy: { select: { name: true } },
      vendor: { select: { name: true } },
      risk: { select: { title: true } },
      device: { select: { name: true } },
      member: { select: { user: { select: { name: true, email: true } } } },
      createdBy: { select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return toCsv({
    headers: [
      'Finding ID',
      'Framework',
      'Severity',
      'Status',
      'Subject type',
      'Subject',
      'Finding',
      'Revision note',
      'Raised by',
      'Raised on',
      'Last updated',
    ],
    rows: findings.map((f) => {
      const [subjectType, subject] = f.task
        ? ['Task', f.task.title]
        : f.policy
          ? ['Policy', f.policy.name]
          : f.vendor
            ? ['Vendor', f.vendor.name]
            : f.risk
              ? ['Risk', f.risk.title]
              : f.device
                ? ['Device', f.device.name]
                : f.member
                  ? ['Person', personName(f.member.user)]
                  : f.evidenceFormType
                    ? ['Document', humanize(f.evidenceFormType)]
                    : ['Area', humanize(f.area)];
      return [
        f.id,
        humanize(f.type),
        humanize(f.severity),
        humanize(f.status),
        subjectType,
        subject,
        f.content,
        f.revisionNote,
        personName(f.createdBy?.user),
        f.createdAt,
        f.updatedAt,
      ];
    }),
  });
}
