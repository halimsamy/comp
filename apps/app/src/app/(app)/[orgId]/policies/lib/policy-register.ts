import type { Policy } from '@db';
import { comparePoliciesByName } from '../all/components/policy-name-sort';
import { isArchivedPolicy } from './policy-archive-state';
import { getPolicyStage, type PolicyLifecycleStage } from './policy-stage';

type Person = { id: string; user: { name: string | null; email?: string | null } } | null;

/** A row of GET /v1/policies: the policy plus the register (auditor) columns. */
export type PolicyRegisterRow = Policy & {
  lifecycleStage?: PolicyLifecycleStage;
  assignee?: Person;
  approver?: Person;
  currentVersion?: {
    id: string;
    version: number;
    approvedAt: Date | string | null;
    approvedBy: Person;
  } | null;
  frameworks?: string[];
  acknowledgement?: { acknowledged: number; total: number };
};

export type StageFilter = PolicyLifecycleStage | 'all' | 'archived';
export type RegisterSort = 'name' | 'status' | 'updatedAt' | 'nextReview';

export interface RegisterFilters {
  search: string;
  stage: StageFilter;
  department: string;
  framework: string;
  reviewOverdue: boolean;
  awaitingMemberId: string | null;
  sort: RegisterSort;
  direction: 'asc' | 'desc';
}

export const stageOf = (policy: PolicyRegisterRow) => policy.lifecycleStage ?? getPolicyStage(policy);

export const isAwaitingApprovalBy = (policy: PolicyRegisterRow, memberId: string | null) =>
  Boolean(memberId) && policy.approverId === memberId && Boolean(policy.pendingVersionId);

const time = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : null;

const STAGE_ORDER: Record<PolicyLifecycleStage, number> = {
  review_due: 0,
  pending_approval: 1,
  draft: 2,
  published: 3,
};

/** Filters and sorts the register. Undated next reviews always sort last. */
export function filterPolicyRegister(
  policies: PolicyRegisterRow[],
  filters: RegisterFilters,
): PolicyRegisterRow[] {
  const query = filters.search.trim().toLowerCase();
  const result = policies.filter((policy) => {
    if (filters.stage === 'archived') {
      if (!isArchivedPolicy(policy)) return false;
    } else {
      if (isArchivedPolicy(policy)) return false;
      if (filters.stage !== 'all' && stageOf(policy) !== filters.stage) return false;
    }
    if (query && !policy.name.toLowerCase().includes(query)) return false;
    if (filters.department !== 'all' && policy.department !== filters.department) return false;
    if (filters.framework !== 'all' && !(policy.frameworks ?? []).includes(filters.framework)) {
      return false;
    }
    if (filters.reviewOverdue && stageOf(policy) !== 'review_due') return false;
    if (filters.awaitingMemberId && !isAwaitingApprovalBy(policy, filters.awaitingMemberId)) {
      return false;
    }
    return true;
  });

  const sign = filters.direction === 'asc' ? 1 : -1;
  return result.sort((a, b) => {
    if (filters.sort === 'nextReview') {
      const [ta, tb] = [time(a.reviewDate), time(b.reviewDate)];
      if (ta === null || tb === null) return ta === tb ? 0 : ta === null ? 1 : -1;
      return (ta - tb) * sign;
    }
    if (filters.sort === 'status') return (STAGE_ORDER[stageOf(a)] - STAGE_ORDER[stageOf(b)]) * sign;
    if (filters.sort === 'updatedAt') return ((time(a.updatedAt) ?? 0) - (time(b.updatedAt) ?? 0)) * sign;
    return comparePoliciesByName(a, b) * sign;
  });
}
