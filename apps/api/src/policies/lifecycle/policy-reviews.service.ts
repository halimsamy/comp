import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, PolicyStatus } from '@db';
import { computeNextReviewDate } from './review-date';

const REVIEWER_SELECT = {
  id: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class PolicyReviewsService {
  async list({
    policyId,
    organizationId,
  }: {
    policyId: string;
    organizationId: string;
  }) {
    await this.getPolicy({ policyId, organizationId });
    return db.policyReview.findMany({
      where: { policyId, organizationId },
      orderBy: { reviewedAt: 'desc' },
      include: {
        reviewer: { select: REVIEWER_SELECT },
        policyVersion: { select: { id: true, version: true } },
      },
    });
  }

  /**
   * Periodic review ("renew"): attest the current version is still fit for
   * purpose. Content, version and acknowledgements are left untouched.
   */
  async record({
    policyId,
    organizationId,
    reviewerId,
    notes,
    nextReviewDate,
    requireReacknowledgement = false,
  }: {
    policyId: string;
    organizationId: string;
    reviewerId?: string;
    notes?: string;
    nextReviewDate?: Date;
    requireReacknowledgement?: boolean;
  }) {
    if (!reviewerId) {
      throw new ForbiddenException(
        'A policy review must be recorded by a signed-in member',
      );
    }
    const policy = await this.getPolicy({ policyId, organizationId });

    if (policy.isArchived || policy.archivedAt) {
      throw new BadRequestException('Archived policies cannot be reviewed');
    }
    if (policy.status === PolicyStatus.draft || !policy.currentVersionId) {
      throw new BadRequestException(
        'Only published policies can be reviewed. Publish the policy first.',
      );
    }
    if (policy.pendingVersionId) {
      throw new BadRequestException(
        'This policy has changes pending approval. Approve or reject them before recording a review.',
      );
    }

    const next = nextReviewDate ?? computeNextReviewDate(policy.frequency);
    if (next.getTime() <= Date.now()) {
      throw new BadRequestException('The next review date must be in the future');
    }

    return db.$transaction(async (tx) => {
      const review = await tx.policyReview.create({
        data: {
          organizationId,
          policyId,
          policyVersionId: policy.currentVersionId,
          reviewerId,
          notes: notes?.trim() || null,
          nextReviewDate: next,
        },
        include: {
          reviewer: { select: REVIEWER_SELECT },
          policyVersion: { select: { id: true, version: true } },
        },
      });
      // Unchanged content keeps its acknowledgements unless the reviewer asks
      // for the yearly re-acknowledgement. Clearing signedBy only resets the
      // current-version cache; PolicyAcknowledgement history is kept.
      await tx.policy.update({
        where: { id: policyId },
        data: {
          reviewDate: next,
          status: PolicyStatus.published,
          ...(requireReacknowledgement ? { signedBy: [] } : {}),
        },
      });
      return review;
    });
  }

  private async getPolicy({
    policyId,
    organizationId,
  }: {
    policyId: string;
    organizationId: string;
  }) {
    const policy = await db.policy.findFirst({
      where: { id: policyId, organizationId },
      select: {
        id: true,
        status: true,
        frequency: true,
        isArchived: true,
        archivedAt: true,
        currentVersionId: true,
        pendingVersionId: true,
      },
    });
    if (!policy) {
      throw new NotFoundException(`Policy with ID ${policyId} not found`);
    }
    return policy;
  }
}
