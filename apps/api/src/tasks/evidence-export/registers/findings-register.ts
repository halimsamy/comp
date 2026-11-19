import { db } from '@db';
import { IsmsNonconformityService } from '../../../isms/isms-nonconformity.service';
import {
  humanize,
  personName,
  toCsv,
  type RegisterParams,
} from './register-csv';

type Finding = Awaited<ReturnType<typeof loadFindings>>[number];

function loadFindings(organizationId: string) {
  return db.finding.findMany({
    where: { organizationId },
    include: {
      task: { select: { title: true } },
      policy: { select: { name: true } },
      vendor: { select: { name: true } },
      risk: { select: { title: true } },
      device: { select: { name: true } },
      member: { select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

function findingSubject(f: Finding): string {
  if (f.task) return `Task: ${f.task.title}`;
  if (f.policy) return `Policy: ${f.policy.name}`;
  if (f.vendor) return `Vendor: ${f.vendor.name}`;
  if (f.risk) return `Risk: ${f.risk.title}`;
  if (f.device) return `Device: ${f.device.name}`;
  if (f.member) return `Person: ${personName(f.member.user)}`;
  if (f.evidenceFormType) return `Document: ${humanize(f.evidenceFormType)}`;
  return `Area: ${humanize(f.area)}`;
}

/**
 * The single nonconformity / findings register (ISO 27001 10.2, 9.2): every
 * row of the 10.2 register (standalone NCs, internal audit findings and, once
 * merged there, platform findings), plus any platform finding not in it yet.
 */
export async function buildFindingsRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const [{ data: register }, findings] = await Promise.all([
    new IsmsNonconformityService().list({ organizationId }),
    loadFindings(organizationId),
  ]);
  const listed = new Set(register.map((row) => row.id));
  const ownerIds = [
    ...new Set(register.flatMap((row) => (row.ownerMemberId ? [row.ownerMemberId] : []))),
  ];
  const owners = ownerIds.length
    ? await db.member.findMany({
        where: { organizationId, id: { in: ownerIds } },
        select: { id: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const ownerName = new Map(owners.map((m) => [m.id, personName(m.user)]));

  return toCsv({
    headers: [
      'Reference',
      'Kind',
      'Source',
      'Source reference',
      'Severity',
      'Status',
      'Description',
      'Root cause',
      'Corrective action',
      'Owner',
      'Due',
      'Closure evidence',
      'Effectiveness reviewed',
      'Raised on',
    ],
    rows: [
      ...register.map((row) => [
        row.reference,
        humanize(row.kind),
        humanize(row.source),
        row.sourceRef,
        humanize(row.severity),
        humanize(row.status),
        row.description,
        row.rootCause,
        row.correctiveAction,
        row.ownerMemberId ? ownerName.get(row.ownerMemberId) : '',
        row.dueDate,
        row.closureEvidence,
        row.effectivenessReviewedAt,
        row.createdAt,
      ]),
      ...findings
        .filter((f) => !listed.has(f.id))
        .map((f) => [
          f.id,
          'Finding',
          humanize(f.type),
          findingSubject(f),
          humanize(f.severity),
          humanize(f.status),
          f.content,
          '',
          f.revisionNote,
          '',
          null,
          '',
          null,
          f.createdAt,
        ]),
    ],
  });
}
