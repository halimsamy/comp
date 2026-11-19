import type { Prisma } from '@db';
import { db } from '@db/server';

export const portalPolicySelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  status: true,
  content: true,
  pdfUrl: true,
  displayFormat: true,
  signedBy: true,
  updatedAt: true,
  currentVersion: {
    select: { id: true, policyId: true, content: true, pdfUrl: true, version: true },
  },
} satisfies Prisma.PolicySelect;

export function portalPolicyWhere({
  organizationId,
  department,
}: {
  organizationId: string;
  department: string;
}): Prisma.PolicyWhereInput {
  return {
    organizationId,
    isArchived: false,
    archivedAt: null,
    AND: [
      // Approved content stays in force while a newer version waits for
      // approval or its periodic review is due ("review due" is not a status).
      {
        OR: [
          { status: 'published' },
          { status: 'needs_review', lastPublishedAt: { not: null } },
        ],
      },
      {
        OR: [
          { visibility: 'ALL' },
          { visibility: 'DEPARTMENT', visibleToDepartments: { has: department } },
        ],
      },
    ],
  };
}

export async function getPortalPolicyMember({
  userId,
  organizationId,
  memberId,
}: {
  userId: string;
  organizationId: string;
  memberId?: string;
}) {
  return db.member.findFirst({
    where: {
      userId,
      organizationId,
      isActive: true,
      deactivated: false,
      ...(memberId ? { id: memberId } : {}),
    },
    select: { id: true, organizationId: true, department: true },
  });
}

export async function getPortalPolicy({
  policyId,
  organizationId,
  department,
}: {
  policyId: string;
  organizationId: string;
  department: string;
}) {
  const policy = await db.policy.findFirst({
    where: { id: policyId, ...portalPolicyWhere({ organizationId, department }) },
    select: portalPolicySelect,
  });
  // A current-version reference must never grant access to another policy's content.
  if (policy?.currentVersion && policy.currentVersion.policyId !== policy.id) return null;
  return policy;
}

/** The member's latest sign-off of this policy, for "Accepted vN on <date>". */
export async function getLatestPortalAcknowledgement({
  policyId,
  memberId,
}: {
  policyId: string;
  memberId: string;
}) {
  const row = await db.policyAcknowledgement.findFirst({
    where: { policyId, memberId },
    orderBy: { acknowledgedAt: 'desc' },
    select: { acknowledgedAt: true, policyVersion: { select: { version: true } } },
  });
  return row
    ? { acknowledgedAt: row.acknowledgedAt, version: row.policyVersion?.version ?? null }
    : null;
}
