import { db } from '@db/server';
import { policyAttestationText } from './policy-attestation';
import { portalPolicyWhere } from './portal-policy-access';

/**
 * Validate the entire batch before writing, in one serializable transaction.
 * The caller must have confirmed the attestation; its text is stored per row.
 */
export async function acknowledgePortalPolicies({
  userId,
  organizationId,
  policyIds,
  memberId,
}: {
  userId: string;
  organizationId: string;
  policyIds: string[];
  memberId?: string;
}) {
  return db.$transaction(
    async (transaction) => {
      const member = await transaction.member.findFirst({
        where: {
          userId,
          organizationId,
          isActive: true,
          deactivated: false,
          ...(memberId ? { id: memberId } : {}),
        },
        select: { id: true, department: true },
      });
      if (!member) return { success: false, status: 403 };

      const ids = [...new Set(policyIds)];
      const where = portalPolicyWhere({ organizationId, department: member.department });
      const policies = await transaction.policy.findMany({
        where: { ...where, id: { in: ids } },
        select: {
          id: true,
          name: true,
          signedBy: true,
          currentVersionId: true,
          currentVersion: { select: { version: true } },
        },
      });
      if (policies.length !== ids.length) return { success: false, status: 404 };

      for (const policy of policies) {
        const { count } = await transaction.policy.updateMany({
          where: {
            ...where,
            id: policy.id,
            NOT: { signedBy: { has: member.id } },
          },
          data: { signedBy: { push: member.id } },
        });
        // signedBy is reset on every publish; this row is the durable history.
        if (count === 0) continue;
        await transaction.policyAcknowledgement.create({
          data: {
            organizationId,
            policyId: policy.id,
            policyVersionId: policy.currentVersionId,
            memberId: member.id,
            attestation: policyAttestationText({
              policyName: policy.name,
              version: policy.currentVersion?.version,
            }),
          },
        });
      }
      return {
        success: true,
        alreadySigned: policies.every((policy) => policy.signedBy.includes(member.id)),
      };
    },
    { isolationLevel: 'Serializable' },
  );
}
