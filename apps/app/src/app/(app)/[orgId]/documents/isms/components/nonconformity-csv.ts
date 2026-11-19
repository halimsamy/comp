import { parseCsvRows } from '../../../people/access/lib/accounts-csv';
import type { NonconformityPayload } from '../hooks/useNonconformities';
import { MANUAL_SOURCES, NC_STATUSES, SOURCE_LABELS } from './nonconformity-schema';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const norm = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');

const SOURCE_BY_TEXT = new Map(
  MANUAL_SOURCES.flatMap((source) => [
    [norm(source), source],
    [norm(SOURCE_LABELS[source] ?? source), source],
  ]),
);
const STATUS_BY_TEXT = new Map(NC_STATUSES.map((status) => [norm(status), status]));

/**
 * An existing nonconformity log as CSV (#171). Columns, any order:
 * Nonconformity (or Description), Source, Reference, Root cause, Corrective
 * action, Owner (email or name), Due (YYYY-MM-DD), Status. Only the
 * nonconformity is required; an unknown source becomes "Other".
 */
export function parseNonconformityCsv({
  text,
  members,
}: {
  text: string;
  members: Array<{ id: string; name: string }>;
}): { rows: NonconformityPayload[]; errors: string[] } {
  const [header = [], ...lines] = parseCsvRows(text);
  const index = (names: string[]) => header.findIndex((h) => names.includes(norm(h)));
  const col = {
    description: index(['nonconformity', 'description', 'finding', 'issue']),
    source: index(['source']),
    sourceRef: index(['reference', 'ref', 'source reference', 'id']),
    rootCause: index(['root cause']),
    correctiveAction: index(['corrective action', 'action']),
    owner: index(['owner', 'assignee']),
    dueDate: index(['due', 'due date']),
    status: index(['status']),
  };
  if (col.description < 0) {
    return { rows: [], errors: ['The file needs a Nonconformity (or Description) column'] };
  }
  const memberIds = new Map(members.map((m) => [norm(m.name), m.id]));
  const cell = (line: string[], i: number) => (i >= 0 ? (line[i] ?? '').trim() : '');

  const rows: NonconformityPayload[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const at = `Row ${i + 2}`;
    const description = cell(line, col.description);
    const owner = cell(line, col.owner);
    const dueDate = cell(line, col.dueDate);
    const statusText = cell(line, col.status);
    const ownerMemberId = owner ? memberIds.get(norm(owner)) : undefined;
    const status = statusText ? STATUS_BY_TEXT.get(norm(statusText)) : 'open';
    const error = !description
      ? 'the nonconformity is empty'
      : owner && !ownerMemberId
        ? `no member "${owner}"`
        : dueDate && !DAY.test(dueDate)
          ? 'due date must be YYYY-MM-DD'
          : !status
            ? `unknown status "${statusText}" (use open, in progress or closed)`
            : null;
    if (error) {
      errors.push(`${at}: ${error}`);
      return;
    }
    rows.push({
      source: SOURCE_BY_TEXT.get(norm(cell(line, col.source))) ?? 'other',
      description,
      sourceRef: cell(line, col.sourceRef) || null,
      rootCause: cell(line, col.rootCause) || null,
      correctiveAction: cell(line, col.correctiveAction) || null,
      ownerMemberId: ownerMemberId ?? null,
      dueDate: dueDate || null,
      status: status ?? 'open',
    });
  });
  return { rows, errors };
}
