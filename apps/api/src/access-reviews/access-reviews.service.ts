import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { AccessAccountsService } from './access-accounts.service';
import { AccessReviewEvidenceService } from './access-review-evidence.service';
import {
  findMemberName,
  findOpenReview,
  requireMemberName,
} from './access-review-guards';
import { summarizeItems } from './access-review-report';
import type {
  CreateAccessReviewDto,
  DecideAccessReviewItemsDto,
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
    const review = await db.accessReview.findFirst({
      where: { id, organizationId },
      include: {
        systems: { orderBy: { systemName: 'asc' } },
        items: { orderBy: [{ accountName: 'asc' }] },
      },
    });
    if (!review) throw new NotFoundException('Access review not found');
    return { ...review, progress: summarizeItems(review.items) };
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
    const keys = dto.systems.map((s) => s.systemKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Each system can only be added once');
    }
    const reviewerIds = [
      ...new Set(
        dto.systems
          .map((s) => s.reviewerMemberId)
          .filter((id): id is string => !!id),
      ),
    ];
    const reviewers = await db.member.findMany({
      where: { id: { in: reviewerIds }, organizationId, deactivated: false },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    if (reviewers.length !== reviewerIds.length) {
      throw new BadRequestException(
        'Reviewers must be active members of this organization',
      );
    }
    const reviewerName = new Map(
      reviewers.map((r) => [r.id, r.user.name || r.user.email]),
    );
    const caller = callerMemberId
      ? await findMemberName({ organizationId, memberId: callerMemberId })
      : null;

    const snapshots = await Promise.all(
      keys.map((systemKey) =>
        this.accounts.getSystemAccounts({ organizationId, systemKey }),
      ),
    );
    if (snapshots.every((s) => s.accounts.length === 0)) {
      throw new BadRequestException(
        'The selected systems have no accounts to review',
      );
    }

    return db.$transaction(
      async (tx) => {
        const review = await tx.accessReview.create({
          data: {
            organizationId,
            name: dto.name.trim(),
            dueDate: new Date(dto.dueDate),
            createdById: callerMemberId ?? null,
            createdByName: caller,
          },
        });
        for (const [index, input] of dto.systems.entries()) {
          const { system, accounts } = snapshots[index];
          const reviewSystem = await tx.accessReviewSystem.create({
            data: {
              reviewId: review.id,
              systemKey: system.key,
              systemName: system.name,
              reviewerId: input.reviewerMemberId ?? null,
              reviewerName: input.reviewerMemberId
                ? (reviewerName.get(input.reviewerMemberId) ?? null)
                : null,
            },
          });
          await tx.accessReviewItem.createMany({
            data: accounts.map((a) => ({
              reviewId: review.id,
              reviewSystemId: reviewSystem.id,
              organizationId,
              accountId: a.accountId,
              accountName: a.name,
              email: a.email,
              ownerMemberId: a.owner?.memberId ?? null,
              ownerName:
                a.owner?.name ??
                (a.isServiceAccount ? 'Service account' : null),
              accountType: a.isServiceAccount ? 'service' : a.type,
              accountStatus: a.status,
              roles: a.roles,
              isAdmin: a.isAdmin,
              mfaEnabled: a.mfaEnabled,
              lastLoginAt: a.lastLoginAt,
              flags: a.flags,
            })),
          });
        }
        return review;
      },
      { timeout: 30_000 },
    );
  }

  async decide({
    organizationId,
    id,
    callerMemberId,
    dto,
  }: {
    organizationId: string;
    id: string;
    callerMemberId?: string;
    dto: DecideAccessReviewItemsDto;
  }) {
    await findOpenReview({ organizationId, id });
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
    const result = await db.accessReviewItem.updateMany({
      where: { id: { in: dto.itemIds }, reviewId: id, organizationId },
      data: {
        decision: dto.decision,
        comment,
        decidedById: callerMemberId,
        decidedByName: name,
        decidedAt: new Date(),
        remediatedAt: null,
        remediationNote: null,
      },
    });
    return { updated: result.count };
  }

  async remediate({
    organizationId,
    id,
    itemId,
    note,
  }: {
    organizationId: string;
    id: string;
    itemId: string;
    note?: string;
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
    return db.accessReviewItem.update({
      where: { id: itemId },
      data: { remediatedAt: new Date(), remediationNote: note?.trim() || null },
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
