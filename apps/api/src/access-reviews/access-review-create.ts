import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import type { AccessAccountsService } from './access-accounts.service';
import { findMemberName } from './access-review-guards';
import type { CreateAccessReviewDto } from './dto/access-reviews.dto';

/** Snapshot each system's accounts with their flags and assign a reviewer per system. */
export async function createReview({
  organizationId,
  callerMemberId,
  dto,
  accounts,
}: {
  organizationId: string;
  callerMemberId?: string;
  dto: CreateAccessReviewDto;
  accounts: AccessAccountsService;
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
      accounts.getSystemAccounts({ organizationId, systemKey }),
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
