/**
 * Pure calculators for the 9.1 metrics Comp AI can measure itself. Each takes
 * plain rows (loaded by metric-compute-data.ts) and returns the value written
 * into a measurement plus a one-line note an auditor can read.
 */

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

export function trainingCompletion({
  memberIds,
  completedVideoIdsByMember,
  requiredVideoIds,
}: {
  memberIds: string[];
  completedVideoIdsByMember: Map<string, Set<string>>;
  requiredVideoIds: readonly string[];
}): ComputedMetricValue {
  const done = memberIds.filter((id) => {
    const completed = completedVideoIdsByMember.get(id) ?? new Set<string>();
    return requiredVideoIds.every((videoId) => completed.has(videoId));
  }).length;
  return {
    value: percent({ part: done, total: memberIds.length }),
    note: `${done} of ${memberIds.length} in-scope members completed all required security training.`,
  };
}

export function policyAcknowledgement({
  memberIds,
  requiredPolicies,
}: {
  memberIds: string[];
  requiredPolicies: Array<{ signedBy: string[] }>;
}): ComputedMetricValue {
  if (requiredPolicies.length === 0) {
    return { value: 'n/a', note: 'No published policies require sign-off yet.' };
  }
  const done = memberIds.filter((id) =>
    requiredPolicies.every((policy) => policy.signedBy.includes(id)),
  ).length;
  return {
    value: percent({ part: done, total: memberIds.length }),
    note: `${done} of ${memberIds.length} in-scope members acknowledged all ${requiredPolicies.length} published policies that require sign-off.`,
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

export interface VendorReviewRow {
  criticality: string | null;
  lastReviewedAt: Date | null;
  nextReviewDue: Date | null;
  hasDpa: boolean;
}

export function vendorReviewCurrency({
  vendors,
  now,
}: {
  vendors: VendorReviewRow[];
  now: Date;
}): ComputedMetricValue {
  // Measured over critical vendors; until any vendor is classified, over all of them.
  const critical = vendors.filter((vendor) => vendor.criticality === 'critical');
  const scope = critical.length > 0 ? critical : vendors;
  const inDate = (vendor: VendorReviewRow) =>
    vendor.lastReviewedAt !== null &&
    (vendor.nextReviewDue === null || vendor.nextReviewDue.getTime() >= now.getTime());
  const done = scope.filter((vendor) => inDate(vendor) && vendor.hasDpa).length;
  const overdue = scope.filter((vendor) => !inDate(vendor)).length;
  const label = critical.length > 0 ? 'critical vendors' : 'vendors (none classified critical yet)';
  return {
    value: percent({ part: done, total: scope.length }),
    note: `${done} of ${scope.length} ${label} have an in-date security review and a DPA on file; ${overdue} have no review or an overdue one.`,
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
