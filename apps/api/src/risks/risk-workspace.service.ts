import { Injectable } from '@nestjs/common';
import { db, Prisma } from '@db';
import type {
  RiskDraftDto,
  ListRiskActionsQueryDto,
} from './dto/risk-workspace.dto';
import { RISK_LIBRARY } from './risk-library';
import { linksFor, resolveFrameworkRefs } from './risk-library-links';

const CLOSED_ACTION_STATUSES = ['done', 'canceled'] as const;
const DAY_MS = 86_400_000;
/** The first treatment action of a library risk is due within this many days. */
const TREATMENT_DUE_DAYS = 90;

const normalizeTitle = (title: string) => title.trim().toLowerCase();

/**
 * Register-wide risk workspace reads and writes: the risk library, bulk add
 * (library + AI suggestions) and the treatment action tracker across risks.
 */
@Injectable()
export class RiskWorkspaceService {
  /**
   * The library, flagging templates whose title is already in the register and
   * counting the org's controls each template's references link to.
   */
  async getLibrary(organizationId: string) {
    const [existing, links] = await Promise.all([
      this.existingTitles(organizationId),
      resolveFrameworkRefs({
        organizationId,
        refs: RISK_LIBRARY.flatMap((template) => template.references),
      }),
    ]);
    return RISK_LIBRARY.map((template) => ({
      ...template,
      added: existing.has(normalizeTitle(template.title)),
      recommendedControls: linksFor({ links, refs: template.references })
        .controlIds.length,
    }));
  }

  /**
   * Create several risks at once. Titles already in the register (or repeated
   * in the batch) are skipped so re-adding a library pack is idempotent.
   */
  async bulkCreate({
    organizationId,
    risks,
    ownerMemberId,
  }: {
    organizationId: string;
    risks: RiskDraftDto[];
    /** Owner of the new risks and their first treatment action (the caller). */
    ownerMemberId?: string;
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

    const links = await resolveFrameworkRefs({
      organizationId,
      refs: toCreate.flatMap((risk) => risk.references ?? []),
    });
    const dueDate = new Date(Date.now() + TREATMENT_DUE_DAYS * DAY_MS);

    // Library risks arrive linked to the controls' evidence tasks their
    // references map to, owned by the caller, with a dated treatment action.
    const created = await db.$transaction(async (tx) => {
      const rows: {
        id: string;
        title: string;
        ref: string | null;
        linkedTasks: number;
      }[] = [];
      for (const risk of toCreate) {
        const refs = risk.references ?? [];
        const { taskIds } = linksFor({ links, refs });
        const row = await tx.risk.create({
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
            treatmentStrategyDescription:
              risk.treatmentStrategyDescription ?? null,
            frameworkRefs: refs,
            assigneeId: ownerMemberId ?? null,
            ...(taskIds.length && {
              tasks: { connect: taskIds.map((id) => ({ id })) },
            }),
          },
          select: { id: true, title: true, ref: true },
        });
        if (ownerMemberId && risk.treatmentStrategyDescription) {
          await tx.taskItem.create({
            data: {
              title: `Implement treatment: ${row.title}`.slice(0, 200),
              description: risk.treatmentStrategyDescription,
              status: 'todo',
              priority: 'medium',
              entityId: row.id,
              entityType: 'risk',
              organizationId,
              createdById: ownerMemberId,
              assigneeId: ownerMemberId,
              dueDate,
            },
          });
        }
        rows.push({ ...row, linkedTasks: taskIds.length });
      }
      return rows;
    });

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
      orderBy: [
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
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
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      risk: riskById.get(item.entityId) ?? null,
      isOverdue: isActionOverdue({
        status: item.status,
        dueDate: item.dueDate,
        now,
      }),
    }));
  }

  /**
   * Evidence tasks linked to risks (the controls side of treatment), one row
   * per risk/task pair, with status, owner and due date (Task.reviewDate).
   */
  async listLinkedTasks({
    organizationId,
    assignmentFilter,
  }: {
    organizationId: string;
    assignmentFilter: Prisma.RiskWhereInput;
  }) {
    const risks = await db.risk.findMany({
      where: { organizationId, ...assignmentFilter, tasks: { some: {} } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        ref: true,
        title: true,
        tasks: {
          where: { organizationId },
          orderBy: { title: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            reviewDate: true,
            assignee: {
              select: { id: true, user: { select: { name: true, email: true } } },
            },
            controls: { select: { id: true, name: true } },
          },
        },
      },
    });
    return risks.flatMap((risk) =>
      risk.tasks.map((task) => ({
        risk: { id: risk.id, ref: risk.ref, title: risk.title },
        task: { ...task, dueDate: task.reviewDate },
      })),
    );
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
  if ((CLOSED_ACTION_STATUSES as readonly string[]).includes(status))
    return false;
  return dueDate.getTime() < now.getTime();
}
