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

export const CSV_HEADER = [
  'Policy',
  'Employee',
  'Email',
  'Department',
  'Role',
  'Status',
  'Current version',
  'Acknowledged version',
  'Acknowledged at (UTC)',
  'Last reminded at (UTC)',
  'Owner',
  'Approved by',
  'Approved at (UTC)',
];

/** One row per audience member and policy, signed or not. */
export interface AcknowledgementCsvRow {
  policyName: string;
  memberName: string;
  memberEmail: string;
  department: string;
  role: string;
  status: 'Acknowledged' | 'Pending' | 'Outdated';
  currentVersion: number | null;
  acknowledgedVersion: number | null;
  acknowledgedAt: Date | null;
  lastRemindedAt: Date | null;
  owner: string;
  approvedBy: string;
  approvedAt: Date | null;
}

function escapeCsv(value: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const version = (v: number | null) => (v === null ? '' : `v${v}`);
const iso = (d: Date | null) => (d ? d.toISOString() : '');

export function toAcknowledgementsCsv(rows: AcknowledgementCsvRow[]): string {
  const lines = rows.map((row) =>
    [
      row.policyName,
      row.memberName,
      row.memberEmail,
      row.department,
      row.role,
      row.status,
      version(row.currentVersion),
      version(row.acknowledgedVersion),
      iso(row.acknowledgedAt),
      iso(row.lastRemindedAt),
      row.owner,
      row.approvedBy,
      iso(row.approvedAt),
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [CSV_HEADER.map(escapeCsv).join(','), ...lines].join('\n');
}
