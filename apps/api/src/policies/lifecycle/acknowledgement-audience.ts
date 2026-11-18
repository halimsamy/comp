import { db } from '@db';
import { filterComplianceMembers } from '../../utils/compliance-filters';

export interface AudiencePolicy {
  visibility: string;
  visibleToDepartments: string[];
}

/**
 * Members who must acknowledge a policy: active members with the compliance
 * obligation who can see it in the portal (same visibility rule as the portal).
 */
export async function getAcknowledgementAudience({
  organizationId,
  policy,
}: {
  organizationId: string;
  policy: AudiencePolicy;
}) {
  const members = await db.member.findMany({
    where: { organizationId, isActive: true, deactivated: false },
    select: {
      id: true,
      role: true,
      department: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  const compliance = await filterComplianceMembers(members, organizationId);
  return compliance.filter(
    (member) =>
      policy.visibility !== 'DEPARTMENT' ||
      policy.visibleToDepartments.includes(member.department),
  );
}

const CSV_HEADER = [
  'Policy',
  'Version',
  'Employee',
  'Email',
  'Acknowledged at (UTC)',
];

export interface AcknowledgementCsvRow {
  policyName: string;
  version: number | null;
  memberName: string;
  memberEmail: string;
  acknowledgedAt: Date;
}

function escapeCsv(value: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toAcknowledgementsCsv(rows: AcknowledgementCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      row.policyName,
      row.version === null ? '' : `v${row.version}`,
      row.memberName,
      row.memberEmail,
      row.acknowledgedAt.toISOString(),
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [CSV_HEADER.map(escapeCsv).join(','), ...lines].join('\n');
}
