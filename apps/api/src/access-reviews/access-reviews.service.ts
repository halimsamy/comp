import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { AttachmentsService } from '../attachments/attachments.service';
import { AccessAccountsService } from './access-accounts.service';
import {
  assertIndependentSignOff,
  decideItems,
} from './access-review-decide';
import { AccessReviewEvidenceService } from './access-review-evidence.service';
import { findOpenReview, requireMemberName } from './access-review-guards';
import { createReview } from './access-review-create';
import { notifyReviewers } from './access-review-notify';
import { reconcileRevocations } from './access-review-reconcile';
import { summarizeItems } from './access-review-report';
import type {
  CreateAccessReviewDto,
  DecideAccessReviewItemsDto,
  RemediateAccessReviewItemDto,
} from './dto/access-reviews.dto';

/**
 * User access reviews (ISO 27001 A.5.18; PCI DSS 7.2.4, 7.2.5.1, 8.2.6):
 * snapshot each system's accounts, record keep/revoke/modify decisions, track
 * changes to completion, then management signs off. Sign-off attaches the PDF
 * report to the Access Review Log task and completes it.
 */
@Injectable()
export class AccessReviewsService {
  private readonly logger = new Logger(AccessReviewsService.name);

  constructor(
    private readonly accounts: AccessAccountsService,
    private readonly evidence: AccessReviewEvidenceService,
    private readonly attachments: AttachmentsService,
  ) {}

  async list(organizationId: string) {
    const reviews = await db.accessReview.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        systems: { select: { systemName: true, reviewerName: true } },
        items: { select: { decision: true, flags: true, remediatedAt: true } },
      },
    });
    return reviews.map(({ items, ...review }) => ({
      ...review,
      progress: summarizeItems(items),
    }));
  }

  async get({ organizationId, id }: { organizationId: string; id: string }) {
    const open = await db.accessReview.findFirst({
      where: { id, organizationId, status: 'in_progress' },
      select: { id: true },
    });
    // Reconciling is best effort: an unreachable integration must not hide the review.
    const stillActive = open
      ? await reconcileRevocations({
          organizationId,
          accounts: this.accounts,
          reviewId: id,
        }).catch(() => new Set<string>())
      : new Set<string>();
    const review = await db.accessReview.findFirst({
      where: { id, organizationId },
      include: {
        systems: { orderBy: { systemName: 'asc' } },
        items: { orderBy: [{ accountName: 'asc' }] },
      },
    });
    if (!review) throw new NotFoundException('Access review not found');
    const proofs = await db.attachment.findMany({
      where: {
        organizationId,
        entityType: 'access_review_item',
        entityId: { in: review.items.map((i) => i.id) },
      },
      select: { id: true, name: true, entityId: true },
    });
    return {
      ...review,
      items: review.items.map((i) => ({
        ...i,
        revokedStillActive: stillActive.has(i.id),
        proofFiles: proofs
          .filter((p) => p.entityId === i.id)
          .map(({ id, name }) => ({ id, name })),
      })),
      progress: summarizeItems(review.items),
    };
  }

  async create({
    organizationId,
    callerMemberId,
    dto,
  }: {
    organizationId: string;
    callerMemberId?: string;
    dto: CreateAccessReviewDto;
  }) {
    const review = await createReview({
      organizationId,
      callerMemberId,
      dto,
      accounts: this.accounts,
    });
    await notifyReviewers({ organizationId, reviewId: review.id, kind: 'started' });
    return review;
  }

  async decide({
    organizationId,
    id,
    callerMemberId,
    userId,
    dto,
  }: {
    organizationId: string;
    id: string;
    callerMemberId?: string;
    userId?: string;
    dto: DecideAccessReviewItemsDto;
  }) {
    await findOpenReview({ organizationId, id });
    return decideItems({
      organizationId,
      reviewId: id,
      callerMemberId,
      userId,
      dto,
    });
  }

  /** Mark a revoke/modify as carried out, with an optional ticket link and/or file as proof. */
  async remediate({
    organizationId,
    id,
    itemId,
    userId,
    dto,
  }: {
    organizationId: string;
    id: string;
    itemId: string;
    userId?: string;
    dto: RemediateAccessReviewItemDto;
  }) {
    await findOpenReview({ organizationId, id });
    const item = await db.accessReviewItem.findFirst({
      where: { id: itemId, reviewId: id, organizationId },
      select: { decision: true },
    });
    if (!item) throw new NotFoundException('Account not found in this review');
    if (item.decision !== 'revoke' && item.decision !== 'modify') {
      throw new BadRequestException(
        'Only revoke or modify decisions need remediation',
      );
    }
    if (dto.fileName && dto.fileType && dto.fileData) {
      await this.attachments.uploadAttachment(
        organizationId,
        itemId,
        'access_review_item',
        {
          fileName: dto.fileName,
          fileType: dto.fileType,
          fileData: dto.fileData,
          description: 'Access change proof',
        },
        userId,
      );
    }
    return db.accessReviewItem.update({
      where: { id: itemId },
      data: {
        remediatedAt: new Date(),
        remediationNote: dto.note?.trim() || null,
        remediationUrl: dto.url?.trim() || null,
      },
    });
  }

  async signOff({
    organizationId,
    id,
    callerMemberId,
    userId,
    note,
  }: {
    organizationId: string;
    id: string;
    callerMemberId?: string;
    userId?: string;
    note?: string;
  }) {
    await findOpenReview({ organizationId, id });
    const name = await requireMemberName({
      organizationId,
      memberId: callerMemberId,
    });
    await assertIndependentSignOff({
      organizationId,
      reviewId: id,
      callerMemberId,
    });
    const items = await db.accessReviewItem.findMany({
      where: { reviewId: id, organizationId },
      select: { decision: true, flags: true, remediatedAt: true },
    });
    const progress = summarizeItems(items);
    if (progress.decided < progress.total) {
      throw new BadRequestException(
        `${progress.total - progress.decided} accounts still need a decision`,
      );
    }
    if (progress.pendingRemediation > 0) {
      throw new BadRequestException(
        `${progress.pendingRemediation} access changes are not marked as done`,
      );
    }
    const signedOffAt = new Date();
    await db.accessReview.update({
      where: { id },
      data: {
        status: 'completed',
        signedOffById: callerMemberId,
        signedOffByName: name,
        signedOffAt,
        signOffNote: note?.trim() || null,
      },
    });
    try {
      await this.evidence.attachToTask({
        organizationId,
        id,
        userId,
        signedOffAt,
      });
    } catch (error) {
      // The sign-off stands; the report can still be downloaded and attached by hand.
      this.logger.warn(
        `Could not attach access review ${id} to its task: ${String(error)}`,
      );
    }
    return this.get({ organizationId, id });
  }

  async remove({ organizationId, id }: { organizationId: string; id: string }) {
    await findOpenReview({ organizationId, id });
    await db.accessReview.delete({ where: { id } });
    return { deleted: true };
  }
}
