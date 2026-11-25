import type { Impact, Likelihood } from '@db';
import { toCsvRow } from '../../../evidence-forms/evidence-forms-csv';
import {
  getRiskScore,
  LEVEL_LABEL,
  ratingLevel,
} from '../../../risks/risk-level';

export type RegisterParams = { organizationId: string };

export type Cell = string | number | boolean | Date | null | undefined;

/** Register rows plus, per row, the requirement reference it cites ("PCI DSS 6.2.2"). */
export type CitedTable = { headers: string[]; rows: Cell[][]; cites: string[] };

function toCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** A CSV document (header row + rows), formula-safe via `toCsvRow`. */
export function toCsv({
  headers,
  rows,
}: {
  headers: string[];
  rows: Cell[][];
}): string {
  return [
    toCsvRow(headers),
    ...rows.map((row) => toCsvRow(row.map(toCell))),
  ].join('\n');
}

/** "very_unlikely" → "Very unlikely". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Score (1-10) and level label of a likelihood × impact rating. */
export function rating(likelihood: Likelihood, impact: Impact) {
  return {
    score: getRiskScore(likelihood, impact).score,
    level: LEVEL_LABEL[ratingLevel(likelihood, impact)],
  };
}

export function personName(
  user: { name: string | null; email: string } | null | undefined,
): string {
  if (!user) return '';
  return user.name || user.email;
}
