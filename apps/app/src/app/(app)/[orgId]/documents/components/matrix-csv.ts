import type { MatrixColumnDefinition, MatrixRowValue } from './submission-utils';

/**
 * CSV export of one submission's matrix (RBAC matrix, infrastructure inventory…):
 * one row per matrix row, one column per matrix column. Follows the
 * monitoring-csv pattern: formula-injection guard, RFC-4180 quoting, CRLF
 * line ends and a UTF-8 BOM so Excel opens it correctly.
 */

function escapeCell(raw: string): string {
  let cell = raw;
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

export function buildMatrixCsv({
  columns,
  rows,
}: {
  columns: ReadonlyArray<MatrixColumnDefinition>;
  rows: MatrixRowValue[];
}): string {
  const lines = [
    columns.map((column) => escapeCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column.key] ?? '')).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** e.g. rbac-matrix-2026-11-11.csv */
export function matrixCsvFilename({
  formType,
  submittedOn,
}: {
  formType: string;
  submittedOn: string;
}): string {
  return `${formType}-${submittedOn.slice(0, 10)}.csv`;
}

/** RFC-4180 CSV → rows of cells (quoted fields, "" escapes, CRLF or LF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}

const normalizeHeader = (value: string) => value.replace(/^﻿/, '').trim().toLowerCase();

/**
 * "Import CSV into rows" (#173): reads a CSV whose header names the matrix
 * columns (by label or key, any case, any order; e.g. one exported with
 * buildMatrixCsv). Select columns accept the option label or value. Unknown
 * columns are ignored; blank lines are skipped. Throws when no column matches.
 */
export function parseMatrixCsv({
  csv,
  columns,
}: {
  csv: string;
  columns: ReadonlyArray<MatrixColumnDefinition>;
}): MatrixRowValue[] {
  const [header = [], ...lines] = parseCsv(csv);
  const columnAt = header.map((name) =>
    columns.find((c) => [c.label, c.key].some((v) => normalizeHeader(v) === normalizeHeader(name))),
  );
  if (!columnAt.some(Boolean)) {
    throw new Error(`The CSV header must name these columns: ${columns.map((c) => c.label).join(', ')}`);
  }
  return lines
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => {
      const row: MatrixRowValue = Object.fromEntries(columns.map((c) => [c.key, '']));
      cells.forEach((raw, index) => {
        const column = columnAt[index];
        if (!column) return;
        // Undo the formula guard that buildMatrixCsv adds on export.
        const value = raw.replace(/^'(?=[=+\-@])/, '').trim();
        const option = column.options?.find((o) => [o.label, o.value].some((v) => v.toLowerCase() === value.toLowerCase()));
        row[column.key] = option ? option.value : value;
      });
      return row;
    });
}
