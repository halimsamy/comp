import { LEVEL_LABEL, type RiskLevel } from '@/lib/risk-score';

export const REGISTER_GROUP_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'category', label: 'Category' },
  { value: 'owner', label: 'Owner' },
] as const;

export type RegisterGroupBy = (typeof REGISTER_GROUP_OPTIONS)[number]['value'];

export function parseGroupBy(value: string | null | undefined): RegisterGroupBy | null {
  return REGISTER_GROUP_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

const SEVERITY_ORDER: RiskLevel[] = ['very-high', 'high', 'medium', 'low', 'very-low'];

export const humanizeCategory = (value: string) => {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

interface GroupableRisk {
  category: string;
  assignee?: { user?: { name: string | null; email: string } | null } | null;
}

/** Group label and sort rank for a register row. */
export function registerGroup<T extends GroupableRisk>({
  risk,
  groupBy,
  severity,
}: {
  risk: T;
  groupBy: RegisterGroupBy;
  severity: RiskLevel;
}): { label: string; rank: string } {
  if (groupBy === 'severity') {
    return { label: LEVEL_LABEL[severity], rank: String(SEVERITY_ORDER.indexOf(severity)) };
  }
  if (groupBy === 'category') {
    const label = humanizeCategory(risk.category);
    return { label, rank: label.toLowerCase() };
  }
  const owner = risk.assignee?.user?.name || risk.assignee?.user?.email;
  // "~" marks Unassigned, sorted after every name.
  return owner ? { label: owner, rank: owner.toLowerCase() } : { label: 'Unassigned', rank: '~' };
}

/** Stable sort by group so rows of one group sit together (original order kept within). */
export function sortByGroup<T extends GroupableRisk>({
  risks,
  groupBy,
  severityOf,
}: {
  risks: T[];
  groupBy: RegisterGroupBy;
  severityOf: (risk: T) => RiskLevel;
}): T[] {
  return risks
    .map((risk, index) => ({ risk, index, rank: registerGroup({ risk, groupBy, severity: severityOf(risk) }).rank }))
    // localeCompare ignores punctuation, so place the "~" (Unassigned) rank explicitly.
    .sort(
      (a, b) =>
        Number(a.rank === '~') - Number(b.rank === '~') ||
        a.rank.localeCompare(b.rank) ||
        a.index - b.index,
    )
    .map((entry) => entry.risk);
}
