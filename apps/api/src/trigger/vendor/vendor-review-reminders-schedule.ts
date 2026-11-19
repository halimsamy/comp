import { db, TaskItemStatus } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { planVendorReminders } from '../../vendors/tpsp/vendor-reminders';
import {
  DUE_SOON_DAYS,
  EXPIRING_SOON_DAYS,
} from '../../vendors/tpsp/vendor-review-status';
import { resolveTaskCreatorAndAssignee } from './vendor-risk-assessment/assignee';

const DAY_MS = 86_400_000;
/** A reminder closed within this window is not re-created. */
const DEDUPE_DAYS = 30;

/**
 * Daily: creates vendor task items for periodic reviews coming due (ISO 27001
 * A.5.22, PCI DSS 12.8.4), assurance documents expiring and contracts ending.
 */
export const vendorReviewRemindersSchedule = schedules.task({
  id: 'vendor-review-reminders-schedule',
  cron: '0 6 * * *',
  maxDuration: 30 * 60,
  run: async () => {
    const now = new Date();
    const reviewHorizon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
    const expiryHorizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);

    const vendors = await db.vendor.findMany({
      where: {
        archivedAt: null,
        OR: [
          { nextReviewDue: { lte: reviewHorizon } },
          // Never reviewed: the planner decides whether it is in scope
          // (criticality, PCI scope or high inherent risk).
          { lastReviewedAt: null, nextReviewDue: null },
          { documents: { some: { expiresAt: { lte: expiryHorizon } } } },
          { contractEndDate: { lte: expiryHorizon } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        assigneeId: true,
        criticality: true,
        handlesCardholderData: true,
        affectsCdeSecurity: true,
        inherentProbability: true,
        inherentImpact: true,
        archivedAt: true,
        lastReviewedAt: true,
        nextReviewDue: true,
        contractEndDate: true,
        documents: { select: { type: true, name: true, expiresAt: true } },
      },
    });

    let created = 0;
    for (const vendor of vendors) {
      const existing = await db.taskItem.findMany({
        where: {
          entityId: vendor.id,
          entityType: 'vendor',
          OR: [
            {
              status: { notIn: [TaskItemStatus.done, TaskItemStatus.canceled] },
            },
            {
              createdAt: {
                gte: new Date(now.getTime() - DEDUPE_DAYS * DAY_MS),
              },
            },
          ],
        },
        select: { title: true },
      });
      const planned = planVendorReminders({
        vendor,
        existingTitles: new Set(existing.map((t) => t.title)),
        now,
      });
      if (planned.length === 0) continue;

      try {
        const { creatorMemberId, assigneeMemberId } =
          await resolveTaskCreatorAndAssignee({
            organizationId: vendor.organizationId,
          });
        await db.taskItem.createMany({
          data: planned.map((reminder) => ({
            title: reminder.title,
            description: reminder.description,
            priority: reminder.priority,
            status: TaskItemStatus.todo,
            entityId: vendor.id,
            entityType: 'vendor' as const,
            organizationId: vendor.organizationId,
            createdById: creatorMemberId,
            assigneeId: vendor.assigneeId ?? assigneeMemberId,
          })),
        });
        created += planned.length;
      } catch (error) {
        logger.warn('Skipping vendor reminders', {
          vendorId: vendor.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Vendor review reminders created', {
      vendorsChecked: vendors.length,
      created,
    });
    return { vendorsChecked: vendors.length, created };
  },
});
