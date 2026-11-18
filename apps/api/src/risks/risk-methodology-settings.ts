import { z } from 'zod';
import type { RiskLevel } from './risk-level';

/** Risk levels, ascending. Same values as risk-level.ts RiskLevel. */
export const RISK_LEVELS = [
  'very-low',
  'low',
  'medium',
  'high',
  'very-high',
] as const satisfies readonly RiskLevel[];

/**
 * The structured part of the ISMS 6.1.2 Risk Assessment Methodology that drives
 * the Risks module. Stored in the 6.1.2 narrative next to the prose, so the
 * document and the app read one source.
 */
export const acceptanceRequiredFromLevelSchema = z.enum(RISK_LEVELS);
export const reviewIntervalMonthsSchema = z.number().int().min(1).max(24);

export interface RiskMethodologySettings {
  /** Lowest residual level that needs a formal risk-owner acceptance (6.1.3 f). */
  acceptanceRequiredFromLevel: RiskLevel;
  /** Months between periodic risk reviews (ISO 27001 8.2). */
  reviewIntervalMonths: number;
}

/** Matches the default 6.1.2 narrative: medium needs owner sign-off, quarterly review. */
export const DEFAULT_RISK_METHODOLOGY_SETTINGS: RiskMethodologySettings = {
  acceptanceRequiredFromLevel: 'medium',
  reviewIntervalMonths: 3,
};

const settingsSchema = z.object({
  acceptanceRequiredFromLevel: acceptanceRequiredFromLevelSchema.optional(),
  reviewIntervalMonths: reviewIntervalMonthsSchema.optional(),
});

/** Parse the settings out of a 6.1.2 narrative JSON, falling back to defaults. */
export function parseRiskMethodologySettings(
  narrative: unknown,
): RiskMethodologySettings {
  const parsed = settingsSchema.safeParse(narrative ?? {});
  const values = parsed.success ? parsed.data : {};
  return {
    acceptanceRequiredFromLevel:
      values.acceptanceRequiredFromLevel ??
      DEFAULT_RISK_METHODOLOGY_SETTINGS.acceptanceRequiredFromLevel,
    reviewIntervalMonths:
      values.reviewIntervalMonths ??
      DEFAULT_RISK_METHODOLOGY_SETTINGS.reviewIntervalMonths,
  };
}

export function isAcceptanceRequired({
  level,
  threshold,
}: {
  level: RiskLevel;
  threshold: RiskLevel;
}): boolean {
  return RISK_LEVELS.indexOf(level) >= RISK_LEVELS.indexOf(threshold);
}

/** Add whole months, clamping to the target month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths({ date, months }: { date: Date; months: number }): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}
