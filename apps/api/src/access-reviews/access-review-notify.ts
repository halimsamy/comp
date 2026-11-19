import { Logger } from '@nestjs/common';
import { db } from '@db';
import { triggerEmail } from '../email/trigger-email';
import { QuestionnaireReviewEmail } from '../email/templates/questionnaire-review';

const logger = new Logger('AccessReviewNotify');

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'https://app.trycomp.ai';

/**
 * #81: emails each assigned reviewer when a review starts, and again as a
 * reminder before the due date. Never throws: a failed email must not undo the review.
 */
export async function notifyReviewers({
  organizationId,
  reviewId,
  kind,
}: {
  organizationId: string;
  reviewId: string;
  kind: 'started' | 'reminder';
}): Promise<number> {
  try {
    const review = await db.accessReview.findFirst({
      where: { id: reviewId, organizationId },
      select: {
        name: true,
        dueDate: true,
        organization: { select: { name: true } },
        systems: { select: { reviewerId: true, systemName: true } },
      },
    });
    if (!review) return 0;
    const byReviewer = new Map<string, string[]>();
    for (const s of review.systems) {
      if (!s.reviewerId) continue;
      byReviewer.set(s.reviewerId, [...(byReviewer.get(s.reviewerId) ?? []), s.systemName]);
    }
    if (byReviewer.size === 0) return 0;
    const reviewers = await db.member.findMany({
      where: { id: { in: [...byReviewer.keys()] }, organizationId, deactivated: false },
      select: { id: true, user: { select: { email: true } } },
    });
    const due = review.dueDate.toISOString().slice(0, 10);
    const link = `${appUrl()}/${organizationId}/people/access/reviews/${reviewId}`;
    let sent = 0;
    for (const reviewer of reviewers) {
      const systems = (byReviewer.get(reviewer.id) ?? []).join(', ');
      const subject =
        kind === 'started'
          ? `Access review "${review.name}" needs your decisions`
          : `Reminder: access review "${review.name}" is due ${due}`;
      await triggerEmail({
        to: reviewer.user.email,
        subject,
        system: true,
        idempotencyKey: `access-review-${kind}-${reviewId}-${reviewer.id}`,
        react: QuestionnaireReviewEmail({
          preview: subject,
          heading: kind === 'started' ? 'You have accounts to review' : 'Your access review is due soon',
          message: `In ${review.organization.name}, you review ${systems}. Decide keep, revoke or modify for each account by ${due}.`,
          ctaUrl: link,
          ctaLabel: 'Open the review',
        }),
      });
      sent++;
    }
    return sent;
  } catch (error) {
    logger.warn(`Could not notify reviewers of access review ${reviewId}: ${String(error)}`);
    return 0;
  }
}
