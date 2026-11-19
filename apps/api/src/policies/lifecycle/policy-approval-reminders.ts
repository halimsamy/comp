import { db } from '@db';
import { notifyPolicyApproval } from './policy-approval-notifier';

const DAY_MS = 24 * 60 * 60 * 1000;
export const APPROVAL_REMINDER_EVERY_DAYS = 3;

/**
 * The reminder a pending approval is due for today (day 3, 6, 9, …), or 0.
 * The job runs daily, so only the exact day sends; the number keys idempotency.
 */
export function approvalReminderNumber({
  submittedAt,
  now,
}: {
  submittedAt: Date;
  now: Date;
}): number {
  const days = Math.floor((now.getTime() - submittedAt.getTime()) / DAY_MS);
  if (days < APPROVAL_REMINDER_EVERY_DAYS || days % APPROVAL_REMINDER_EVERY_DAYS !== 0) return 0;
  return days / APPROVAL_REMINDER_EVERY_DAYS;
}

/**
 * Reminds approvers of policy versions pending for 3+ days, then every 3 days.
 * The idempotency key per reminder number makes reruns of the job a no-op.
 */
export async function remindPendingPolicyApprovals(now = new Date()) {
  const pending = await db.policy.findMany({
    where: {
      pendingVersionId: { not: null },
      approverId: { not: null },
      isArchived: false,
      archivedAt: null,
    },
    select: { id: true, organizationId: true, approverId: true, pendingVersionId: true },
  });
  const versions = await db.policyVersion.findMany({
    where: { id: { in: pending.flatMap((p) => p.pendingVersionId ?? []) } },
    select: { id: true, submittedAt: true, submittedById: true },
  });
  const byId = new Map(versions.map((v) => [v.id, v]));

  let reminded = 0;
  for (const policy of pending) {
    const version = policy.pendingVersionId ? byId.get(policy.pendingVersionId) : undefined;
    if (!version?.submittedAt || !policy.approverId) continue;
    const reminder = approvalReminderNumber({ submittedAt: version.submittedAt, now });
    if (reminder === 0) continue;
    const sent = await notifyPolicyApproval({
      kind: 'reminder',
      organizationId: policy.organizationId,
      policyId: policy.id,
      versionId: version.id,
      recipientMemberId: policy.approverId,
      actorMemberId: version.submittedById,
      idempotencyKey: `policy-approval-reminder:${version.id}:${policy.approverId}:${reminder}`,
    });
    if (sent) reminded++;
  }
  return { pending: pending.length, reminded };
}
