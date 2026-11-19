import { db } from '@db';
import { filterComplianceMembers } from '../utils/compliance-filters';
import { loadModuleData } from './overview-data-modules';
import { countTaskProgress } from './task-progress';

const memberName = {
  select: { user: { select: { name: true, email: true } } },
};

/**
 * Raw org state the needs-attention cards and the deadline queue are built from.
 * One loader so the overview page, the weekly digest and the snapshot job all
 * read the same queue.
 */
export async function loadOverviewData({
  organizationId,
}: {
  organizationId: string;
}) {
  const [
    tasks,
    policies,
    members,
    vendors,
    checkRuns,
    accessReviews,
    modules,
  ] = await Promise.all([
    db.task.findMany({
      where: { organizationId, archivedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        reviewDate: true,
        assigneeId: true,
        assignee: memberName,
      },
    }),
    db.policy.findMany({
      where: { organizationId, isArchived: false, archivedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        reviewDate: true,
        isRequiredToSign: true,
        signedBy: true,
        visibility: true,
        visibleToDepartments: true,
        pendingVersionId: true,
        updatedAt: true,
        assignee: memberName,
      },
    }),
    db.member.findMany({
      where: { organizationId, isActive: true, deactivated: false },
      select: {
        id: true,
        role: true,
        department: true,
        user: { select: { name: true, email: true, role: true } },
      },
    }),
    db.vendor.findMany({
      where: { organizationId, archivedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        criticality: true,
        inherentProbability: true,
        inherentImpact: true,
        handlesCardholderData: true,
        affectsCdeSecurity: true,
        lastReviewedAt: true,
        nextReviewDue: true,
        assignee: memberName,
        documents: { select: { type: true, name: true, expiresAt: true } },
      },
    }),
    // Latest real run per (connection, check). Held/inconclusive runs and the
    // AWS task-evidence runs never count as a check result.
    db.integrationCheckRun.findMany({
      where: {
        connection: { organizationId, status: { in: ['active', 'error'] } },
        status: { in: ['success', 'failed'] },
        OR: [{ scanMode: null }, { scanMode: { not: 'task_evidence' } }],
      },
      distinct: ['connectionId', 'checkId'],
      orderBy: [
        { connectionId: 'asc' },
        { checkId: 'asc' },
        { createdAt: 'desc' },
      ],
      select: { id: true, checkName: true, status: true, failedCount: true },
    }),
    db.accessReview.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        signedOffAt: true,
      },
    }),
    loadModuleData({ organizationId }),
  ]);

  const [complianceMembers, pendingVersions] = await Promise.all([
    filterComplianceMembers(members, organizationId),
    // When each pending policy version was submitted for approval.
    db.policyVersion.findMany({
      where: {
        id: {
          in: policies
            .map((p) => p.pendingVersionId)
            .filter((id): id is string => !!id),
        },
        policy: { organizationId },
      },
      select: { id: true, submittedAt: true },
    }),
  ]);
  const submittedAt = new Map(pendingVersions.map((v) => [v.id, v.submittedAt]));
  const nameOf = new Map(members.map((m) => [m.id, m.user.name || m.user.email]));

  return {
    tasks: tasks.filter((t) => t.status !== 'not_relevant'),
    taskProgress: countTaskProgress(tasks),
    policies: policies.map(({ pendingVersionId, updatedAt, ...policy }) => ({
      ...policy,
      submittedForApprovalAt:
        policy.status === 'needs_review'
          ? ((pendingVersionId && submittedAt.get(pendingVersionId)) ||
            updatedAt)
          : null,
    })),
    members: complianceMembers,
    vendors,
    checkRuns,
    accessReviews,
    ...modules,
    forms: modules.forms.map(({ ownerMemberId, ...form }) => ({
      ...form,
      ownerName: ownerMemberId ? (nameOf.get(ownerMemberId) ?? null) : null,
    })),
  };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverviewData>>;
