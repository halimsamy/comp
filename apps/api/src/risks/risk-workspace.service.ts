import { Injectable } from '@nestjs/common';
import { db, Prisma } from '@db';
import type { RiskDraftDto, ListRiskActionsQueryDto } from './dto/risk-workspace.dto';
import { RISK_LIBRARY } from './risk-library';

const CLOSED_ACTION_STATUSES = ['done', 'canceled'] as const;

const normalizeTitle = (title: string) => title.trim().toLowerCase();

/**
 * Register-wide risk workspace reads and writes: the risk library, bulk add
 * (library + AI suggestions) and the treatment action tracker across risks.
 */
@Injectable()
export class RiskWorkspaceService {
  /** The library, flagging templates whose title is already in the register. */
  async getLibrary(organizationId: string) {
    const existing = await this.existingTitles(organizationId);
    return RISK_LIBRARY.map((template) => ({
      ...template,
      added: existing.has(normalizeTitle(template.title)),
    }));
  }

  /**
   * Create several risks at once. Titles already in the register (or repeated
   * in the batch) are skipped so re-adding a library pack is idempotent.
   */
  async bulkCreate({
    organizationId,
    risks,
  }: {
    organizationId: string;
    risks: RiskDraftDto[];
  }) {
    const seen = await this.existingTitles(organizationId);
    const toCreate: RiskDraftDto[] = [];
    const skipped: string[] = [];
    for (const risk of risks) {
      const key = normalizeTitle(risk.title);
      if (seen.has(key)) {
        skipped.push(risk.title);
        continue;
      }
      seen.add(key);
      toCreate.push(risk);
    }

    const created = await db.$transaction(
      toCreate.map((risk) =>
        db.risk.create({
          data: {
            organizationId,
            title: risk.title.trim(),
            description: risk.description,
            category: risk.category,
            likelihood: risk.likelihood,
            impact: risk.impact,
            // Residual starts at inherent until treatment is assessed.
            residualLikelihood: risk.likelihood,
            residualImpact: risk.impact,
            treatmentStrategy: 'mitigate',
            treatmentStrategyDescription: risk.treatmentStrategyDescription ?? null,
          },
          select: { id: true, title: true },
        }),
      ),
    );

    return { created, skipped };
  }

  /** Treatment actions (risk TaskItems) across the register, soonest due first. */
  async listActions({
    organizationId,
    query,
    assignmentFilter,
  }: {
    organizationId: string;
    query: ListRiskActionsQueryDto;
    assignmentFilter: Prisma.RiskWhereInput;
  }) {
    const risks = await db.risk.findMany({
      where: { organizationId, ...assignmentFilter },
      select: { id: true, title: true, status: true },
    });
    const riskById = new Map(risks.map((risk) => [risk.id, risk]));
    const now = new Date();

    const items = await db.taskItem.findMany({
      where: {
        organizationId,
        entityType: 'risk',
        entityId: { in: [...riskById.keys()] },
        ...(query.status && { status: query.status }),
        ...(query.assigneeId && { assigneeId: query.assigneeId }),
        ...(query.overdue && {
          AND: [
            { status: { notIn: [...CLOSED_ACTION_STATUSES] } },
            { dueDate: { lt: now } },
          ],
        }),
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        entityId: true,
        createdAt: true,
        assignee: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      risk: riskById.get(item.entityId) ?? null,
      isOverdue: isActionOverdue({ status: item.status, dueDate: item.dueDate, now }),
    }));
  }

  private async existingTitles(organizationId: string): Promise<Set<string>> {
    const rows = await db.risk.findMany({
      where: { organizationId },
      select: { title: true },
    });
    return new Set(rows.map((row) => normalizeTitle(row.title)));
  }
}

export function isActionOverdue({
  status,
  dueDate,
  now,
}: {
  status: string;
  dueDate: Date | null;
  now: Date;
}): boolean {
  if (!dueDate) return false;
  if ((CLOSED_ACTION_STATUSES as readonly string[]).includes(status)) return false;
  return dueDate.getTime() < now.getTime();
}
