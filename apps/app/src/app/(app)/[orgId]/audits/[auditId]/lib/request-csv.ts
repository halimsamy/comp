import type { TeamAuditRequestPayload } from '@/hooks/use-audits';
import { parseCsvRows } from '../../../people/access/lib/accounts-csv';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface Member {
  id: string;
  name: string | null;
  email: string;
}

/**
 * The auditor's request list (PBC list) as CSV (#109). Columns, any order:
 * Request (or Title), Description, Requirement (identifier, e.g. A.5.15 or
 * 8.3.1), Owner (email or name), Due (YYYY-MM-DD). Only Request is required.
 */
export function parseRequestCsv({
  text,
  requirements,
  members,
}: {
  text: string;
  requirements: Array<{ id: string; identifier: string }>;
  members: Member[];
}): { rows: TeamAuditRequestPayload[]; errors: string[] } {
  const [header = [], ...lines] = parseCsvRows(text);
  const index = (names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const col = {
    title: index(['request', 'title', 'item', 'request item']),
    description: index(['description', 'details', 'notes']),
    requirement: index(['requirement', 'control', 'clause', 'reference']),
    owner: index(['owner', 'assignee', 'owner email']),
    due: index(['due', 'due date', 'duedate']),
  };
  if (col.title < 0) return { rows: [], errors: ['The file needs a Request (or Title) column'] };

  const requirementIds = new Map(requirements.map((r) => [r.identifier.trim().toLowerCase(), r.id]));
  const memberIds = new Map(
    members.flatMap((m) => [
      [m.email.toLowerCase(), m.id] as const,
      ...(m.name ? [[m.name.trim().toLowerCase(), m.id] as const] : []),
    ]),
  );
  const cell = (line: string[], i: number) => (i >= 0 ? (line[i] ?? '').trim() : '');

  const rows: TeamAuditRequestPayload[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const at = `Row ${i + 2}`;
    const title = cell(line, col.title);
    if (!title) {
      errors.push(`${at}: the request is empty`);
      return;
    }
    const requirement = cell(line, col.requirement);
    const owner = cell(line, col.owner);
    const due = cell(line, col.due);
    const requirementId = requirement ? requirementIds.get(requirement.toLowerCase()) : undefined;
    const ownerMemberId = owner ? memberIds.get(owner.toLowerCase()) : undefined;
    const error =
      requirement && !requirementId
        ? `no requirement "${requirement}" in this audit`
        : owner && !ownerMemberId
          ? `no member "${owner}"`
          : due && !DAY.test(due)
            ? 'due date must be YYYY-MM-DD'
            : null;
    if (error) {
      errors.push(`${at}: ${error}`);
      return;
    }
    const description = cell(line, col.description);
    rows.push({
      title: title.slice(0, 200),
      ...(description ? { description } : {}),
      ...(requirementId ? { requirementId } : {}),
      ...(ownerMemberId ? { ownerMemberId } : {}),
      ...(due ? { dueDate: due } : {}),
    });
  });
  return { rows, errors };
}
