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
