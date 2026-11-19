import { getAcknowledgementAudience } from './acknowledgement-audience';
import { getPolicyLifecycleStage } from './lifecycle-stage';

const PERSON_SELECT = {
  select: { id: true, user: { select: { name: true, email: true } } },
} as const;

const FRAMEWORK_NAME_SELECT = {
  select: { frameworkInstance: { select: { framework: { select: { name: true } } } } },
} as const;

/** Extra select for the policy register (auditor columns). */
export const POLICY_REGISTER_SELECT = {
  assignee: PERSON_SELECT,
  approver: PERSON_SELECT,
  currentVersion: {
    select: {
      id: true,
      version: true,
      approvedAt: true,
      approvedBy: PERSON_SELECT,
    },
  },
  frameworkControlLinks: FRAMEWORK_NAME_SELECT,
  controls: { select: { requirementsMapped: FRAMEWORK_NAME_SELECT } },
} as const;

// framework is nullable for custom framework instances.
type FrameworkLink = { frameworkInstance: { framework: { name: string } | null } };

interface RegisterPolicyRow {
  status: string;
  pendingVersionId: string | null;
  reviewDate: Date | null;
  signedBy: string[];
  visibility: string;
  visibleToDepartments: string[];
  frameworkControlLinks: FrameworkLink[];
  controls: { requirementsMapped: FrameworkLink[] }[];
}

export function frameworkNames(policy: Pick<RegisterPolicyRow, 'frameworkControlLinks' | 'controls'>) {
  const names = new Set<string>();
  for (const link of policy.frameworkControlLinks) {
    if (link.frameworkInstance.framework) names.add(link.frameworkInstance.framework.name);
  }
  for (const control of policy.controls) {
    for (const map of control.requirementsMapped) {
      if (map.frameworkInstance.framework) names.add(map.frameworkInstance.framework.name);
    }
  }
  return [...names].sort();
}

/**
 * Adds lifecycleStage, frameworks and acknowledged N/M to each policy. The
 * audience is loaded once for the organization, then filtered per policy.
 */
export async function enrichPolicyRegister<T extends RegisterPolicyRow>({
  organizationId,
  policies,
  now = new Date(),
}: {
  organizationId: string;
  policies: T[];
  now?: Date;
}) {
  const audience = policies.length
    ? await getAcknowledgementAudience({
        organizationId,
        policy: { visibility: 'ALL', visibleToDepartments: [] },
      })
    : [];

  return policies.map(({ frameworkControlLinks, controls, ...policy }) => {
    const members = audience.filter(
      (member) =>
        policy.visibility !== 'DEPARTMENT' ||
        policy.visibleToDepartments.includes(member.department),
    );
    const signed = new Set(policy.signedBy);
    return {
      ...policy,
      lifecycleStage: getPolicyLifecycleStage({
        status: policy.status,
        pendingVersionId: policy.pendingVersionId,
        reviewDate: policy.reviewDate,
        now,
      }),
      frameworks: frameworkNames({ frameworkControlLinks, controls }),
      acknowledgement: {
        acknowledged: members.filter((member) => signed.has(member.id)).length,
        total: members.length,
      },
    };
  });
}
