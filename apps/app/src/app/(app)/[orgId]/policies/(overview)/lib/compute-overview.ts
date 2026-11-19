// Shared utility - can be used by both server and client
import { isArchivedPolicy } from '../../lib/policy-archive-state';
import { getPolicyStage, type PolicyLifecycleStage } from '../../lib/policy-stage';

interface PolicyForOverview {
  id: string;
  status: string;
  isArchived: boolean;
  archivedAt?: Date | string | null;
  pendingVersionId?: string | null;
  reviewDate?: Date | string | null;
  lifecycleStage?: PolicyLifecycleStage;
  assigneeId: string | null;
  assignee?: {
    id: string;
    user: {
      name: string | null;
    };
  } | null;
}

type StageCounts = Record<PolicyLifecycleStage | 'archived', number>;

export interface AssigneeData extends StageCounts {
  id: string;
  name: string;
  total: number;
}

export interface PoliciesOverview {
  totalPolicies: number;
  byStage: StageCounts;
  assigneeData: AssigneeData[];
}

export const UNASSIGNED_ID = 'unassigned';

const emptyCounts = (): StageCounts => ({
  draft: 0,
  pending_approval: 0,
  published: 0,
  review_due: 0,
  archived: 0,
});

/**
 * Overview stats by lifecycle stage (same rule as the API), grouped by owner.
 * Active policies without an owner are counted in an "Unassigned" bar.
 * Pure function - works on both server and client.
 */
export function computePoliciesOverview(policies: PolicyForOverview[]): PoliciesOverview {
  const byStage = emptyCounts();
  const byOwner = new Map<string, AssigneeData>();

  for (const policy of policies) {
    const key = isArchivedPolicy(policy)
      ? 'archived'
      : (policy.lifecycleStage ??
        getPolicyStage({
          status: policy.status,
          pendingVersionId: policy.pendingVersionId ?? null,
          reviewDate: policy.reviewDate ?? null,
        }));
    byStage[key] += 1;
    if (key === 'archived') continue;

    const ownerId = policy.assignee?.id ?? UNASSIGNED_ID;
    const owner = byOwner.get(ownerId) ?? {
      id: ownerId,
      name: policy.assignee ? policy.assignee.user.name || 'Unknown' : 'Unassigned',
      total: 0,
      ...emptyCounts(),
    };
    owner.total += 1;
    owner[key] += 1;
    byOwner.set(ownerId, owner);
  }

  return {
    totalPolicies: policies.length,
    byStage,
    assigneeData: Array.from(byOwner.values()),
  };
}
