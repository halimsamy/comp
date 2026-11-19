import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { requireMemberName } from './access-review-guards';
import type { DecideAccessReviewItemsDto } from './dto/access-reviews.dto';

/**
 * Records keep / revoke / modify decisions (#79, #80, #81):
 * - a bulk call (several ids) only touches undecided rows, never earlier decisions;
 * - remediation is cleared only when one row's decision actually changes;
 * - keeping a flagged account needs a justification;
 * - nobody decides on their own account;
 * - a system with an assigned reviewer is decided by that reviewer only;
 * - every change is written to the audit log.
 */
export async function decideItems({
  organizationId,
  reviewId,
  callerMemberId,
  userId,
  dto,
}: {
  organizationId: string;
  reviewId: string;
  callerMemberId?: string;
  userId?: string;
  dto: DecideAccessReviewItemsDto;
}) {
  const comment = dto.comment?.trim() || null;
  if (dto.decision === 'modify' && !comment) {
    throw new BadRequestException(
      'Describe the access change for modify decisions',
    );
  }
  const name = await requireMemberName({
    organizationId,
    memberId: callerMemberId,
  });
  const bulk = dto.itemIds.length > 1;
  const items = await db.accessReviewItem.findMany({
    where: { id: { in: dto.itemIds }, reviewId, organizationId },
    select: {
      id: true,
      accountName: true,
      decision: true,
      flags: true,
      ownerMemberId: true,
      reviewSystem: { select: { reviewerId: true, systemName: true } },
    },
  });
  if (items.length === 0) throw new NotFoundException('Accounts not found');

  if (items.some((i) => i.ownerMemberId === callerMemberId)) {
    throw new ForbiddenException(
      'You cannot review your own account. Ask another reviewer.',
    );
  }
  const otherReviewer = items.find(
    (i) => i.reviewSystem.reviewerId && i.reviewSystem.reviewerId !== callerMemberId,
  );
  if (otherReviewer) {
    throw new ForbiddenException(
      `${otherReviewer.reviewSystem.systemName} is assigned to another reviewer`,
    );
  }

  const targets = bulk ? items.filter((i) => i.decision === null) : items;
  const changed = targets.filter((i) => i.decision !== dto.decision);
  if (
    dto.decision === 'keep' &&
    !comment &&
    targets.some((i) => i.flags.length > 0)
  ) {
    throw new BadRequestException(
      'Add a justification to keep flagged accounts',
    );
  }

  const now = new Date();
  const ids = targets.map((i) => i.id);
  const changedIds = new Set(changed.map((i) => i.id));
  await db.$transaction([
    db.accessReviewItem.updateMany({
      where: { id: { in: ids.filter((id) => changedIds.has(id)) } },
      data: {
        decision: dto.decision,
        comment,
        decidedById: callerMemberId,
        decidedByName: name,
        decidedAt: now,
        remediatedAt: null,
        remediationNote: null,
        remediationUrl: null,
      },
    }),
    // Same decision again on one row: update the note, keep the remediation.
    db.accessReviewItem.updateMany({
      where: { id: { in: ids.filter((id) => !changedIds.has(id)) } },
      data: { comment, decidedById: callerMemberId, decidedByName: name, decidedAt: now },
    }),
    ...(userId
      ? [
          db.auditLog.createMany({
            data: targets.map((i) => ({
              organizationId,
              userId,
              memberId: callerMemberId ?? null,
              entityType: 'people' as const,
              entityId: i.id,
              description: `${dto.decision === 'keep' ? 'kept' : dto.decision === 'revoke' ? 'revoked' : 'modified'} access for ${i.accountName} (${i.reviewSystem.systemName})`,
              data: {
                action: 'access_review_decision',
                reviewId,
                account: i.accountName,
                system: i.reviewSystem.systemName,
                oldValue: i.decision,
                newValue: dto.decision,
                ...(comment && { comment }),
              },
            })),
          }),
        ]
      : []),
  ]);
  return { updated: targets.length, skipped: items.length - targets.length };
}

/** PCI 7.2.4 separation of duties: whoever started the review or owns an account in it can't sign off. */
export async function assertIndependentSignOff({
  organizationId,
  reviewId,
  callerMemberId,
}: {
  organizationId: string;
  reviewId: string;
  callerMemberId?: string;
}) {
  const review = await db.accessReview.findFirst({
    where: { id: reviewId, organizationId },
    select: { createdById: true },
  });
  const ownsItem = await db.accessReviewItem.findFirst({
    where: { reviewId, organizationId, ownerMemberId: callerMemberId },
    select: { id: true },
  });
  if (!callerMemberId || review?.createdById === callerMemberId || ownsItem) {
    throw new ForbiddenException('Another manager must sign off');
  }
}
