/** Shape of GET /v1/people-lifecycle/compliance (#3, #86, #87): one entry per person. */
export type ComplianceStatus = 'complete' | 'in_progress' | 'incomplete' | 'overdue' | 'expired' | 'not_required';

export interface ComplianceItem {
  key: string;
  title: string;
  status: ComplianceStatus;
  detail: string;
  completed?: number;
  total?: number;
}

export interface MemberCompliance {
  member: {
    id: string;
    name: string | null;
    email: string;
    department: string;
    offboardDate: string | null;
    deactivated: boolean;
    former: boolean;
  };
  items: ComplianceItem[];
  overall: ComplianceStatus;
  completedItems: number;
  totalItems: number;
}

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  incomplete: 'Incomplete',
  overdue: 'Overdue',
  expired: 'Expired',
  not_required: 'Not required',
};

export const COMPLIANCE_FILTERS = [
  { value: 'all', label: 'All compliance' },
  { value: 'complete', label: 'Complete' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'expired', label: 'Expired' },
] as const;
export type ComplianceFilter = (typeof COMPLIANCE_FILTERS)[number]['value'];

const NEEDS_ATTENTION: ComplianceStatus[] = ['incomplete', 'in_progress', 'overdue', 'expired'];

export function matchesCompliance({
  entry,
  filter,
}: {
  entry: MemberCompliance | undefined;
  filter: ComplianceFilter;
}): boolean {
  if (filter === 'all') return true;
  if (!entry) return false;
  if (filter === 'attention') return NEEDS_ATTENTION.includes(entry.overall);
  return entry.overall === filter;
}

/** The counts the People table cells already render, from the compliance items. */
export function taskCompletionFrom(entry: MemberCompliance) {
  const count = (key: string) => {
    const item = entry.items.find((i) => i.key === key);
    return item && item.status !== 'not_required'
      ? { completed: item.completed ?? 0, total: item.total ?? 0 }
      : { completed: 0, total: 0 };
  };
  const policies = count('policies');
  const training = count('training');
  return {
    completed: policies.completed + training.completed,
    total: policies.total + training.total,
    policies,
    training,
  };
}

export const tracks = ({ entries, key }: { entries: MemberCompliance[]; key: string }) =>
  entries.some((e) => e.items.some((i) => i.key === key && i.status !== 'not_required'));
