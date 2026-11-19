import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db, TaskStatus } from '@db';
import { parseDay } from '../attachments/attachment-validity';

/** Bulk "Set due date" (#118): Task.reviewDate is the due date. */
export async function setTaskDueDates({
  organizationId,
  taskIds,
  dueDate,
}: {
  organizationId: string;
  taskIds: string[];
  dueDate: string | null;
}) {
  const reviewDate = dueDate === null ? null : parseDay(dueDate, 'dueDate');
  const { count } = await db.task.updateMany({
    where: { id: { in: taskIds }, organizationId, archivedAt: null },
    data: { reviewDate },
  });
  if (count === 0) throw new BadRequestException('No tasks were updated. Check the task IDs.');
  return { updatedCount: count };
}

/**
 * The requester withdraws a review request (#44). Unlike a rejection it keeps
 * the approver, so the next request (or auto-evidence) goes to the same person,
 * and it is logged as a withdrawal, not a rejection.
 */
export async function withdrawReviewRequest({
  organizationId,
  taskId,
  userId,
}: {
  organizationId: string;
  taskId: string;
  userId: string;
}) {
  const task = await db.task.findFirst({
    where: { id: taskId, organizationId, archivedAt: null },
    select: { id: true, title: true, status: true, previousStatus: true, approverId: true },
  });
  if (!task) throw new NotFoundException('Task not found');
  if (task.status !== TaskStatus.in_review || !task.approverId) {
    throw new BadRequestException('This task has no open review request');
  }
  const member = await db.member.findFirst({
    where: { userId, organizationId, deactivated: false },
    select: { id: true },
  });
  const revertTo = task.previousStatus ?? TaskStatus.todo;
  return db.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: task.id, organizationId },
      data: { status: revertTo, previousStatus: null, approvedAt: null },
      select: { id: true, status: true, approverId: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        memberId: member?.id ?? null,
        entityType: 'task',
        entityId: task.id,
        description: 'withdrew the review request',
        data: {
          action: 'review_withdrawn',
          taskTitle: task.title,
          approverId: task.approverId,
          revertedToStatus: revertTo,
        },
      },
    });
    return updated;
  });
}

/**
 * "Set validity for all files on this task" (#107). Files whose start falls on
 * or after the new end are skipped (an end date must follow the start).
 */
export async function setTaskAttachmentsValidity({
  organizationId,
  taskId,
  validFrom,
  validUntil,
}: {
  organizationId: string;
  taskId: string;
  validFrom?: string;
  validUntil: string | null;
}) {
  const task = await db.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
  if (!task) throw new NotFoundException('Task not found');
  const from = validFrom ? parseDay(validFrom, 'validFrom') : null;
  const until = validUntil === null ? null : parseDay(validUntil, 'validUntil');
  const files = await db.attachment.findMany({
    where: { organizationId, entityType: 'task', entityId: task.id },
    select: { id: true, createdAt: true, validFrom: true },
  });
  const updates = files.flatMap((file) => {
    const start = from ?? file.validFrom ?? file.createdAt;
    if (until && until <= start) return [];
    return [db.attachment.update({ where: { id: file.id }, data: { validFrom: start, validUntil: until } })];
  });
  await db.$transaction(updates);
  return { updatedCount: updates.length, skippedCount: files.length - updates.length };
}
