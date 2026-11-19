import { db } from '@db';
import { Injectable, Logger } from '@nestjs/common';
import { isUserUnsubscribed } from '@trycompai/email';
import { triggerEmail } from '../email/trigger-email';
import { QuestionnaireReviewEmail } from '../email/templates/questionnaire-review';
import { isOrgParticipant } from '../utils/org-participation-rule';

export interface OwnershipNotice {
  organizationId: string;
  /** Member who now owns the record. */
  memberId: string;
  /** Human noun, e.g. "risk", "vendor", "asset", "control". */
  entityType: string;
  entityName: string;
  /** Org-relative path (e.g. `/risk/rsk_1`) or an absolute URL. */
  url: string;
  /** Who made the change; they are not emailed about their own action. */
  assignedByUserId?: string | null;
}

/**
 * Emails a member when they become the owner of a record (ISO 27001 5.3 / A.5.2,
 * PCI DSS 12.4: named owners). Respects the `ownershipAssignments` preference
 * from the role matrix and the member's own email settings. Never throws.
 */
@Injectable()
export class OwnershipNotifier {
  private readonly logger = new Logger(OwnershipNotifier.name);

  async notify(notice: OwnershipNotice): Promise<boolean> {
    try {
      return await this.send(notice);
    } catch (error) {
      this.logger.error(
        `Ownership notification failed for member ${notice.memberId}`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  private async send({
    organizationId,
    memberId,
    entityType,
    entityName,
    url,
    assignedByUserId,
  }: OwnershipNotice): Promise<boolean> {
    const [member, organization] = await Promise.all([
      db.member.findFirst({
        where: { id: memberId, organizationId, deactivated: false },
        select: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, isInternal: true },
      }),
    ]);
    const user = member?.user;
    if (!user?.email) return false;
    if (assignedByUserId && user.id === assignedByUserId) return false;
    if (
      !isOrgParticipant(user.role, {
        orgIsInternal: organization?.isInternal ?? false,
      })
    ) {
      return false;
    }
    const unsubscribed = await isUserUnsubscribed(
      db,
      user.email,
      'ownershipAssignments',
      organizationId,
    );
    if (unsubscribed) return false;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.BETTER_AUTH_URL ??
      'https://app.trycomp.ai';
    const link = /^https?:\/\//.test(url)
      ? url
      : `${appUrl}/${organizationId}${url}`;
    const orgName = organization?.name ?? 'your organization';

    await triggerEmail({
      to: user.email,
      subject: `You now own the ${entityType} "${entityName}"`,
      system: true,
      react: QuestionnaireReviewEmail({
        preview: `You now own the ${entityType} "${entityName}"`,
        heading: `You're the owner of a ${entityType}`,
        message: `You were made the owner of the ${entityType} "${entityName}" in ${orgName}. Owners keep it up to date and answer for it in audits.`,
        ctaUrl: link,
        ctaLabel: `Open ${entityType}`,
      }),
    });
    return true;
  }
}
