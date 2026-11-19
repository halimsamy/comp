/**
 * Policy acknowledgement coverage: one sign-off owed per (published policy that
 * requires signing, member who can see it). A DEPARTMENT-visibility policy is
 * owed only by members of those departments. The single rule shared by the
 * Overview card and the 9.1 policy_acknowledgement metric.
 */
export function policyAckCoverage({
  policies,
  members,
}: {
  policies: Array<{
    id: string;
    status: string;
    isRequiredToSign: boolean;
    signedBy: string[];
    visibility: string;
    visibleToDepartments: string[];
  }>;
  members: Array<{ id: string; department: string }>;
}) {
  let total = 0;
  let pending = 0;
  const peopleAssigned = new Set<string>();
  const peoplePending = new Set<string>();
  const policiesPending = new Set<string>();
  const required = policies.filter(
    (policy) => policy.isRequiredToSign && policy.status === 'published',
  );
  for (const policy of required) {
    for (const member of members) {
      if (
        policy.visibility === 'DEPARTMENT' &&
        !policy.visibleToDepartments.includes(member.department)
      ) {
        continue;
      }
      total++;
      peopleAssigned.add(member.id);
      if (policy.signedBy.includes(member.id)) continue;
      pending++;
      peoplePending.add(member.id);
      policiesPending.add(policy.id);
    }
  }
  return {
    requiredPolicies: required.length,
    total,
    pending,
    peopleAssigned,
    peoplePending,
    policiesPending,
  };
}
