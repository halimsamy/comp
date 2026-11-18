import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, Prisma } from '@db';
import type { CreateRiskReviewDto } from './dto/risk-workspace.dto';
import { loadRiskMethodologySettings } from './load-risk-methodology-settings';
import { addMonths } from './risk-methodology-settings';
import {
  buildRiskReviewSnapshot,
  type RiskReviewSnapshot,
  type SnapshotRiskInput,
} from './risk-review-snapshot';
import { isActionOverdue } from './risk-workspace.service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored snapshot's totals, or null for a malformed row. */
function snapshotTotals(snapshot: Prisma.JsonValue) {
  if (!isRecord(snapshot) || !isRecord(snapshot.totals)) return null;
  return snapshot.totals;
}

/**
 * Periodic risk reviews (ISO 27001 8.2). Append-only: recording a review
 * freezes the register and schedules the next one from the 6.1.2 interval.
 */
@Injectable()
export class RiskReviewsService {
  async list(organizationId: string) {
    const [reviews, settings] = await Promise.all([
      db.riskReview.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reviewedByName: true,
          trigger: true,
          notes: true,
          nextReviewDue: true,
          createdAt: true,
          snapshot: true,
        },
      }),
      loadRiskMethodologySettings({ organizationId }),
    ]);

    const latest = reviews[0] ?? null;
    const now = new Date();
    return {
      data: reviews.map(({ snapshot, ...review }) => ({
        ...review,
        totals: snapshotTotals(snapshot),
      })),
      settings,
      status: {
        lastReviewedAt: latest?.createdAt ?? null,
        // No review yet means one is due now.
        nextReviewDue: latest?.nextReviewDue ?? null,
        isOverdue: !latest || latest.nextReviewDue.getTime() < now.getTime(),
      },
    };
  }

  async get({ id, organizationId }: { id: string; organizationId: string }) {
    const review = await db.riskReview.findFirst({
      where: { id, organizationId },
    });
    if (!review) {
      throw new NotFoundException('Risk review not found');
    }
    return review;
  }

  async create({
    organizationId,
    callerMemberId,
    dto,
  }: {
    organizationId: string;
    callerMemberId: string | null | undefined;
    dto: CreateRiskReviewDto;
  }) {
    const reviewerId = dto.reviewedById ?? callerMemberId;
    if (!reviewerId) {
      throw new BadRequestException(
        'reviewedById is required when the caller is not a member (API key).',
      );
    }
    const reviewer = await db.member.findFirst({
      where: { id: reviewerId, organizationId, deactivated: false },
      select: { id: true, user: { select: { name: true, email: true } } },
    });
    if (!reviewer) {
      throw new BadRequestException('Reviewer is not an active member of this organization');
    }

    const settings = await loadRiskMethodologySettings({ organizationId });
    const snapshot = await this.buildSnapshot({
      organizationId,
      threshold: settings.acceptanceRequiredFromLevel,
    });
    const now = new Date();

    return db.riskReview.create({
      data: {
        organizationId,
        reviewedById: reviewer.id,
        reviewedByName: reviewer.user.name?.trim() || reviewer.user.email,
        trigger: dto.trigger ?? 'scheduled',
        notes: dto.notes?.trim() || null,
        snapshot,
        nextReviewDue: addMonths({ date: now, months: settings.reviewIntervalMonths }),
      },
    });
  }

  private async buildSnapshot({
    organizationId,
    threshold,
  }: {
    organizationId: string;
    threshold: RiskReviewSnapshot['acceptanceRequiredFromLevel'];
  }): Promise<RiskReviewSnapshot> {
    const [risks, acceptances, actions] = await Promise.all([
      db.risk.findMany({
        where: { organizationId, status: { not: 'archived' } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          likelihood: true,
          impact: true,
          residualLikelihood: true,
          residualImpact: true,
          treatmentStrategy: true,
          assignee: { select: { user: { select: { name: true, email: true } } } },
        },
      }),
      db.riskAcceptance.findMany({
        where: { organizationId, riskId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { riskId: true, residualLikelihood: true, residualImpact: true },
      }),
      db.taskItem.findMany({
        where: {
          organizationId,
          entityType: 'risk',
          status: { notIn: ['done', 'canceled'] },
        },
        select: { entityId: true, status: true, dueDate: true },
      }),
    ]);

    const latestByRisk = new Map<string, SnapshotRiskInput['latestAcceptance']>();
    for (const acceptance of acceptances) {
      if (acceptance.riskId && !latestByRisk.has(acceptance.riskId)) {
        latestByRisk.set(acceptance.riskId, acceptance);
      }
    }
    const now = new Date();
    const inputs: SnapshotRiskInput[] = risks.map(({ assignee, ...risk }) => {
      const open = actions.filter((action) => action.entityId === risk.id);
      return {
        ...risk,
        ownerName: assignee ? assignee.user.name?.trim() || assignee.user.email : null,
        latestAcceptance: latestByRisk.get(risk.id) ?? null,
        openActions: open.length,
        overdueActions: open.filter((action) => isActionOverdue({ ...action, now })).length,
      };
    });

    return buildRiskReviewSnapshot({ risks: inputs, threshold });
  }
}
