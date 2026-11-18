import { db } from '@db';
import { filterComplianceMembers } from '../utils/compliance-filters';

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
    trainingRecords,
    trainingModules,
    vendors,
    checkRuns,
    findings,
    accessReviews,
  ] = await Promise.all([
    db.task.findMany({
      where: {
        organizationId,
        archivedAt: null,
        status: { not: 'not_relevant' },
      },
      select: {
        id: true,
        title: true,
        status: true,
        reviewDate: true,
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
    db.trainingCompletionRecord.findMany({
      where: { organizationId, member: { isActive: true, deactivated: false } },
      select: { memberId: true, moduleId: true, expiresAt: true },
    }),
    db.trainingModule.findMany({
      where: { organizationId },
      select: { id: true, title: true, isEnabled: true },
    }),
    db.vendor.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        criticality: true,
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
    db.finding.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { _all: true },
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
  ]);

  const complianceMembers = await filterComplianceMembers(
    members,
    organizationId,
  );

  return {
    tasks,
    policies,
    members: complianceMembers,
    trainingRecords,
    trainingModules,
    vendors,
    checkRuns,
    findings: findings.map((f) => ({ status: f.status, count: f._count._all })),
    accessReviews,
  };
}

export type OverviewData = Awaited<ReturnType<typeof loadOverviewData>>;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function personName(
  member: { user: { name: string | null; email: string } } | null,
): string | null {
  if (!member) return null;
  return member.user.name || member.user.email;
}

/** Only the latest-expiring document of each type matters; older ones are superseded. */
export function newestDocuments<
  T extends { type: string; expiresAt: Date | null },
>(documents: T[]): Array<T & { expiresAt: Date }> {
  const newest = new Map<string, T & { expiresAt: Date }>();
  for (const doc of documents) {
    const { expiresAt } = doc;
    if (!expiresAt) continue;
    const current = newest.get(doc.type);
    if (!current || current.expiresAt < expiresAt)
      newest.set(doc.type, { ...doc, expiresAt });
  }
  return [...newest.values()];
}
