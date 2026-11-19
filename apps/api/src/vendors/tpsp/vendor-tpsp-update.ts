import { Prisma } from '@db';
import type { ResponsibilityMatrixRowDto } from '../dto/vendor-tpsp-fields.dto';

/** Prisma data for the 12.8.5 matrix: undefined = unchanged, null = cleared. */
export function responsibilityMatrixUpdate(
  rows: ResponsibilityMatrixRowDto[] | null | undefined,
): { responsibilityMatrix?: Prisma.InputJsonValue | typeof Prisma.DbNull } {
  if (rows === undefined) return {};
  if (rows === null) return { responsibilityMatrix: Prisma.DbNull };
  return {
    responsibilityMatrix: rows.map((row) => ({
      requirement: row.requirement,
      owner: row.owner,
      notes: row.notes ?? null,
      confirmed: row.confirmed ?? false,
    })),
  };
}

const TPSP_DATE_FIELDS = [
  'contractStartDate',
  'contractEndDate',
  'tpspAcknowledgementDate',
  'assurancePeriodStart',
  'assurancePeriodEnd',
  'assuranceExpiresAt',
  'pciStatusCheckedAt',
  'nextReviewDue',
] as const;

type TpspDateField = (typeof TPSP_DATE_FIELDS)[number];

/**
 * TPSP date strings → Date. Prisma rejects date-only strings ("2026-11-18")
 * that @IsDateString accepts, so API and MCP callers would get a 500.
 */
export function tpspDateUpdate(
  dto: Partial<Record<TpspDateField, string | null>>,
): Partial<Record<TpspDateField, Date | null>> {
  const data: Partial<Record<TpspDateField, Date | null>> = {};
  for (const field of TPSP_DATE_FIELDS) {
    const value = dto[field];
    if (value === undefined) continue;
    data[field] = value === null ? null : new Date(value);
  }
  return data;
}
