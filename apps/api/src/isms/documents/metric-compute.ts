/**
 * Pure calculators for the 9.1 metrics Comp AI can measure itself. Each takes
 * plain rows (loaded by metric-compute-data.ts) and returns the value written
 * into a measurement plus a one-line note an auditor can read.
 */
import type { VendorReviewStatus } from '../../vendors/tpsp/vendor-review-status';

/** measurement.source / metric.dataSource for values Comp AI computes itself. */
export const COMPUTED_SOURCE = 'computed';

/** Seeded metric keys Comp AI measures from its own data. */
export const COMPUTED_METRIC_KEYS = [
  'training_completion',
  'policy_acknowledgement',
  'finding_ageing',
  'risk_treatment_status',
  'vendor_review_currency',
  'task_on_time',
  'vulnerability_remediation',
] as const;

export type ComputedMetricKey = (typeof COMPUTED_METRIC_KEYS)[number];

export function isComputedMetricKey(key: string | null): key is ComputedMetricKey {
  return COMPUTED_METRIC_KEYS.some((computed) => computed === key);
}

export interface ComputedMetricValue {
  value: string;
  note: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function percent({ part, total }: { part: number; total: number }): string {
  if (total === 0) return 'n/a';
  return `${Math.round((part / total) * 1000) / 10}%`;
}

/** Over trainingStatusForOrg, the rule People and the Overview training card use. */
export function trainingCompletion({
  members,
}: {
  members: Array<{ status: string }>;
}): ComputedMetricValue {
  const required = members.filter((member) => member.status !== 'not_required');
  const done = required.filter((member) => member.status === 'complete').length;
  const expired = required.filter((member) => member.status === 'expired').length;
  return {
    value: percent({ part: done, total: required.length }),
    note: `${done} of ${required.length} in-scope members have current security-awareness and role training; ${expired} expired.`,
  };
}

/** Over policyAckCoverage, the rule the Overview acknowledgements card uses. */
export function policyAcknowledgement({
  coverage,
}: {
  coverage: {
    requiredPolicies: number;
    pending: number;
    peopleAssigned: Set<string>;
    peoplePending: Set<string>;
  };
}): ComputedMetricValue {
  if (coverage.requiredPolicies === 0) {
    return { value: 'n/a', note: 'No published policies require sign-off yet.' };
  }
  const total = coverage.peopleAssigned.size;
  const done = total - coverage.peoplePending.size;
  return {
    value: percent({ part: done, total }),
    note: `${done} of ${total} in-scope members acknowledged every policy assigned to them; ${coverage.pending} sign-offs pending across ${coverage.requiredPolicies} published policies that require sign-off.`,
  };
}

export function findingAgeing({
  openItems,
  now,
}: {
  openItems: Array<{ createdAt: Date; dueDate: Date | null }>;
  now: Date;
}): ComputedMetricValue {
  const age = (item: { createdAt: Date }) =>
    (now.getTime() - item.createdAt.getTime()) / DAY_MS;
  const under30 = openItems.filter((item) => age(item) < 30).length;
  const under90 = openItems.filter((item) => age(item) >= 30 && age(item) < 90).length;
  const over90 = openItems.length - under30 - under90;
  const pastDue = openItems.filter(
    (item) => item.dueDate !== null && item.dueDate.getTime() < now.getTime(),
  ).length;
  return {
    value: String(openItems.length),
    note: `Open findings and nonconformities by age: ${under30} under 30 days, ${under90} at 30–90 days, ${over90} over 90 days; ${pastDue} past their due date.`,
  };
}

const HIGH = ['likely', 'very_likely', 'major', 'severe'];

export function riskTreatmentStatus({
  risks,
}: {
  risks: Array<{
    status: string;
    treatmentStrategyDescription: string | null;
    residualLikelihood: string;
    residualImpact: string;
  }>;
}): ComputedMetricValue {
  const active = risks.filter((risk) => risk.status !== 'archived');
  const treated = (risk: (typeof active)[number]) =>
    risk.status === 'closed' || Boolean(risk.treatmentStrategyDescription?.trim());
  const done = active.filter(treated).length;
  const highUntreated = active.filter(
    (risk) =>
      HIGH.includes(risk.residualLikelihood) &&
      HIGH.includes(risk.residualImpact) &&
      !treated(risk),
  ).length;
  return {
    value: percent({ part: done, total: active.length }),
    note: `${done} of ${active.length} risks have a documented treatment plan or are closed; ${highUntreated} high residual risks have no plan.`,
  };
}

/**
 * Vendors in review scope (isVendorInReviewScope) with a review that is current
 * or due soon (reviewStatus), the rule the Vendors list and Overview use.
 */
export function vendorReviewCurrency({
  statuses,
}: {
  statuses: VendorReviewStatus[];
}): ComputedMetricValue {
  if (statuses.length === 0) {
    return { value: 'n/a', note: 'No vendor is in scope for periodic review yet.' };
  }
  const done = statuses.filter((s) => s === 'current' || s === 'due_soon').length;
  const overdue = statuses.filter((s) => s === 'overdue').length;
  const never = statuses.filter((s) => s === 'never_reviewed').length;
  return {
    value: percent({ part: done, total: statuses.length }),
    note: `${done} of ${statuses.length} vendors in review scope have an in-date review; ${overdue} overdue and ${never} never reviewed.`,
  };
}

export function taskOnTimeRate({
  tasks,
  now,
}: {
  tasks: Array<{ reviewDate: Date | null }>;
  now: Date;
}): ComputedMetricValue {
  // reviewDate is the next due date; a past one means the task is overdue.
  const onTime = tasks.filter(
    (task) => !task.reviewDate || task.reviewDate.getTime() >= now.getTime(),
  ).length;
  return {
    value: percent({ part: onTime, total: tasks.length }),
    note: `${onTime} of ${tasks.length} recurring evidence tasks are within their due date.`,
  };
}

/**
 * Critical/High vulnerabilities fixed by their SLA due date (PCI DSS 6.3.3,
 * 11.3.1). Closed after the due date, or still open past it, counts as missed;
 * open ones not yet due are not counted either way.
 */
export function vulnerabilityRemediationWithinSla({
  vulnerabilities,
  now,
}: {
  vulnerabilities: Array<{ resolvedAt: Date | null; slaDueAt: Date | null }>;
  now: Date;
}): ComputedMetricValue {
  const dated = vulnerabilities.flatMap(({ resolvedAt, slaDueAt }) =>
    slaDueAt ? [{ resolvedAt, due: slaDueAt.getTime() }] : [],
  );
  const met = dated.filter((row) => row.resolvedAt && row.resolvedAt.getTime() <= row.due).length;
  const missedOpen = dated.filter((row) => !row.resolvedAt && row.due < now.getTime()).length;
  const missedClosed = dated.filter((row) => row.resolvedAt && row.resolvedAt.getTime() > row.due).length;
  const total = met + missedOpen + missedClosed;
  if (total === 0) {
    return {
      value: 'n/a',
      note: 'No Critical or High vulnerability has reached its SLA due date yet.',
    };
  }
  return {
    value: percent({ part: met, total }),
    note: `${met} of ${total} Critical/High vulnerabilities were remediated within SLA; ${missedClosed} closed late and ${missedOpen} are open past their due date.`,
  };
}
