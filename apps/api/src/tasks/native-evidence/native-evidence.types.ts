import { createHash } from 'crypto';
import type { TaskFrequency } from '@db';
import type { IsmsExportSection } from '../../isms/utils/export-shared';

export interface RuleContext {
  organizationId: string;
  now: Date;
  /** The task's frequency, for rules whose window is "this period". */
  frequency: TaskFrequency | null;
}

export interface RuleResult {
  holds: boolean;
  /** One line shown on the task page and in the PDF. */
  summary: string;
  /** What still blocks the rule (empty when it holds). */
  issues: string[];
  /** Stable identity of the evidence: unchanged evidence is never resubmitted. */
  fingerprint: string;
  /** Body of the snapshot PDF. */
  sections: IsmsExportSection[];
}

export interface NativeEvidenceRule {
  key: string;
  /** Module the evidence comes from, e.g. "ISMS" or "People". */
  module: string;
  /** The rule in words, e.g. "Risk treatment plan published within 12 months". */
  title: string;
  /** Requirement references printed on the PDF. */
  reference: string;
  /** App path below /{orgId} where the evidence lives. */
  path: string;
  evaluate(ctx: RuleContext): Promise<RuleResult>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function monthsBefore({ date, months }: { date: Date; months: number }): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export function daysBefore({ date, days }: { date: Date; days: number }): Date {
  return new Date(date.getTime() - days * DAY_MS);
}

export function fingerprintOf(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

export function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '—';
}

export function personLabel(user: { name: string | null; email: string }): string {
  return user.name ? `${user.name} (${user.email})` : user.email;
}

/** "3 of 5 members: A, B, C" — caps long name lists for the task page. */
export function listIssue({
  label,
  names,
  max = 5,
}: {
  label: string;
  names: string[];
  max?: number;
}): string[] {
  if (names.length === 0) return [];
  const shown = names.slice(0, max).join(', ');
  const more = names.length > max ? ` and ${names.length - max} more` : '';
  return [`${label}: ${shown}${more}`];
}
