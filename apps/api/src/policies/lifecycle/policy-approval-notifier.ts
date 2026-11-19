import { db } from '@db';
import { Logger } from '@nestjs/common';
import { isUserUnsubscribed } from '@trycompai/email';
import { triggerEmail } from '../../email/trigger-email';
import {
  PolicyApprovalRequestedEmail,
  type PolicyApprovalEmailKind,
} from '../../email/templates/policy-approval-requested';
import { NovuService } from '../../notifications/novu.service';

const logger = new Logger('PolicyApprovalNotifier');
// Generic in-app workflow ({ title, message, url }) shared with task notifications.
const IN_APP_WORKFLOW_ID = 'evidence-updated';

const memberName = (user?: { name: string | null; email: string } | null) =>
  user?.name?.trim() || user?.email || 'Someone';

const SUBJECT: Record<PolicyApprovalEmailKind, (policy: string) => string> = {
  requested: (p) => `Approval requested: "${p}"`,
  reminder: (p) => `Reminder: "${p}" is waiting for your approval`,
  rejected: (p) => `Changes to "${p}" were rejected`,
};

const IN_APP_TITLE: Record<PolicyApprovalEmailKind, string> = {
  requested: 'Policy approval requested',
  reminder: 'Policy still waiting for your approval',
  rejected: 'Policy changes rejected',
};

/**
 * Emails and notifies (in-app) one member about a policy approval event.
 * `idempotencyKey` keeps retries and double clicks from sending twice.
 * Never throws: a failed notification must not fail the approval itself.
 */
export async function notifyPolicyApproval({
  kind,
  organizationId,
  policyId,
  versionId,
  recipientMemberId,
  actorMemberId,
  comment,
  idempotencyKey,
}: {
  kind: PolicyApprovalEmailKind;
  organizationId: string;
  policyId: string;
  versionId: string;
  recipientMemberId: string;
  actorMemberId?: string | null;
  comment?: string | null;
  idempotencyKey?: string;
}): Promise<boolean> {
  try {
    const [recipient, actor, policy, version, organization] = await Promise.all([
      db.member.findFirst({
        where: { id: recipientMemberId, organizationId, deactivated: false },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
      actorMemberId
        ? db.member.findFirst({
            where: { id: actorMemberId, organizationId },
            select: { user: { select: { name: true, email: true } } },
          })
        : null,
      db.policy.findFirst({ where: { id: policyId, organizationId }, select: { name: true } }),
      db.policyVersion.findFirst({ where: { id: versionId, policyId }, select: { version: true } }),
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);
    if (!recipient?.user.email || !policy || !version) return false;
    // Nobody needs an email about their own action.
    if (actorMemberId && actorMemberId === recipientMemberId) return false;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'https://app.trycomp.ai';
    const policyUrl = `${appUrl}/${organizationId}/policies/${policyId}`;
    const actorName = memberName(actor?.user);
    const organizationName = organization?.name ?? 'your organization';
    const toName = memberName(recipient.user);

    const unsubscribed = await isUserUnsubscribed(
      db,
      recipient.user.email,
      'policyNotifications',
      organizationId,
    );
    if (!unsubscribed) {
      await triggerEmail({
        to: recipient.user.email,
        subject: SUBJECT[kind](policy.name),
        react: PolicyApprovalRequestedEmail({
          kind,
          toName,
          toEmail: recipient.user.email,
          policyName: policy.name,
          version: version.version,
          actorName,
          organizationName,
          policyUrl,
          comment,
        }),
        system: true,
        idempotencyKey,
      });
    }

    await new NovuService().trigger({
      workflowId: IN_APP_WORKFLOW_ID,
      subscriberId: `${recipient.user.id}-${organizationId}`,
      email: recipient.user.email,
      payload: {
        title: IN_APP_TITLE[kind],
        message: `${policy.name} v${version.version}${kind === 'rejected' ? ` rejected by ${actorName}` : ''}`,
        url: policyUrl,
      },
    });
    return true;
  } catch (error) {
    logger.warn(
      `Failed to send policy ${kind} notification for ${policyId}`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
