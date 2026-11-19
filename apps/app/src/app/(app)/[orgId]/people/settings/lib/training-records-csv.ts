import { csvCell, parseCsvRows } from '../../access/lib/accounts-csv';

export interface TrainingRecordRow {
  memberId: string;
  name: string | null;
  email: string | null;
  training: string;
  completedAt: string;
  expiresAt: string | null;
  source: string;
  hasAttachment: boolean;
}

export interface ImportRow {
  email: string;
  module: string;
  completedAt: string;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** #94: every training completion, for auditors (ISO A.6.3, PCI DSS 12.6). */
export function buildTrainingRecordsCsv(rows: TrainingRecordRow[]): string {
  const header = ['Name', 'Email', 'Training', 'Completed', 'Valid until', 'Source', 'Certificate'];
  const body = rows.map((r) => [
    r.name ?? '',
    r.email ?? '',
    r.training,
    day(r.completedAt),
    day(r.expiresAt),
    r.source,
    r.hasAttachment ? 'yes' : 'no',
  ]);
  return [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Columns: email, training (or module), completed (or date / completedAt). */
export function parseTrainingImportCsv(text: string): { rows: ImportRow[]; errors: string[] } {
  const [header = [], ...lines] = parseCsvRows(text);
  const index = (names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const email = index(['email', 'e-mail']);
  const module = index(['training', 'module', 'course']);
  const date = index(['completed', 'completedat', 'completed at', 'date']);
  if (email < 0 || module < 0 || date < 0) {
    return { rows: [], errors: ['The file needs Email, Training and Completed columns'] };
  }
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    if (line.every((cell) => !cell.trim())) return;
    const row = { email: line[email]?.trim() ?? '', module: line[module]?.trim() ?? '', completedAt: line[date]?.trim() ?? '' };
    if (!row.email || !row.module || Number.isNaN(Date.parse(row.completedAt))) {
      errors.push(`Row ${i + 2}: needs an email, a training and a valid date`);
      return;
    }
    rows.push(row);
  });
  return { rows, errors };
}
