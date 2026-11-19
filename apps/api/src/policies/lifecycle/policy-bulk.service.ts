import { BadRequestException, Injectable } from '@nestjs/common';
import { db } from '@db';
import { isMemberOrgParticipant } from '../../utils/org-participation';
import { PoliciesService } from '../policies.service';

type SkipReason = { policyId: string; name: string; reason: string };

/** The version a bulk submission sends for approval, or why there is none. */
export function pickVersionToSubmit(policy: {
  pendingVersionId: string | null;
  lastPublishedAt: Date | null;
  currentVersionId: string | null;
  currentVersion: { version: number } | null;
  versions: { id: string; version: number }[];
}): { versionId: string } | { reason: string } {
  if (policy.pendingVersionId) return { reason: 'Already waiting for approval' };
  if (!policy.lastPublishedAt && policy.currentVersionId) {
    return { versionId: policy.currentVersionId };
  }
  const current = policy.currentVersion?.version ?? 0;
  const newer = policy.versions.find((v) => v.version > current);
  return newer ? { versionId: newer.id } : { reason: 'No new version to approve' };
}

@Injectable()
export class PolicyBulkService {
  constructor(private readonly policiesService: PoliciesService) {}

  async submitForApproval({
    organizationId,
    policyIds,
    approverId,
    actorMemberId,
  }: {
    organizationId: string;
    policyIds: string[];
    approverId: string;
    actorMemberId?: string;
  }) {
    const policies = await db.policy.findMany({
      where: { id: { in: policyIds }, organizationId, isArchived: false, archivedAt: null },
      select: {
        id: true,
        name: true,
        pendingVersionId: true,
        lastPublishedAt: true,
        currentVersionId: true,
        currentVersion: { select: { version: true } },
        versions: { select: { id: true, version: true }, orderBy: { version: 'desc' }, take: 1 },
      },
    });

    const submitted: string[] = [];
    const skipped: SkipReason[] = [];
    // One approval request per policy, so each keeps its own approval record.
    for (const policy of policies) {
      const pick = pickVersionToSubmit(policy);
      if ('reason' in pick) {
        skipped.push({ policyId: policy.id, name: policy.name, reason: pick.reason });
        continue;
      }
      try {
        await this.policiesService.submitForApproval(
          policy.id,
          pick.versionId,
          organizationId,
          { approverId },
          actorMemberId,
        );
        submitted.push(policy.id);
      } catch (error) {
        skipped.push({
          policyId: policy.id,
          name: policy.name,
          reason: error instanceof Error ? error.message : 'Failed to submit',
        });
      }
    }
    return { submitted: submitted.length, submittedIds: submitted, skipped };
  }

  async setOwner({
    organizationId,
    policyIds,
    ownerId,
  }: {
    organizationId: string;
    policyIds: string[];
    ownerId: string;
  }) {
    const owner = await db.member.findFirst({
      where: { id: ownerId, organizationId, deactivated: false },
      select: { user: { select: { role: true } } },
    });
    if (!owner) {
      throw new BadRequestException('Owner is not an active member of this organization');
    }
    if (!(await isMemberOrgParticipant(owner.user.role, organizationId))) {
      throw new BadRequestException('Cannot assign a platform admin as owner');
    }
    const { count } = await db.policy.updateMany({
      where: { id: { in: policyIds }, organizationId },
      data: { assigneeId: ownerId },
    });
    return { updated: count };
  }
}
