import { BadRequestException } from '@nestjs/common';
import { db, type AttachmentEntityType } from '@db';
import { computeNextTaskReviewDate } from '../tasks/task-completion';

type ValidityFields = {
  createdAt: Date;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → start of that day (UTC). Throws on anything else. */
export function parseDay(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!DAY.test(value) || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a date in YYYY-MM-DD format`);
  }
  return date;
}

/**
 * True when the file was valid at some point inside the audit period.
 * Files uploaded before validity existed (no validFrom) keep the old rule:
 * uploaded inside the period.
 */
export function attachmentValidInPeriod(
  attachment: ValidityFields,
  period: { from?: Date; to?: Date },
): boolean {
  const { from, to } = period;
  if (!from && !to) return true;
  if (!attachment.validFrom) {
    const uploaded = attachment.createdAt;
    return !(from && uploaded < from) && !(to && uploaded > to);
  }
  if (to && attachment.validFrom > to) return false;
  return !(from && attachment.validUntil && attachment.validUntil < from);
}

/**
 * Validity for a new upload. A task's evidence stays valid for one task cycle
 * (its frequency) unless the uploader sets the dates; other files are open-ended.
 */
export async function resolveUploadValidity({
  organizationId,
  entityType,
  entityId,
  validFrom,
  validUntil,
  now = new Date(),
}: {
  organizationId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  validFrom?: string;
  validUntil?: string;
  now?: Date;
}): Promise<{ validFrom: Date; validUntil: Date | null }> {
  const from = validFrom ? parseDay(validFrom, 'validFrom') : now;
  let until = validUntil ? parseDay(validUntil, 'validUntil') : null;
  if (!until && entityType === 'task') {
    const task = await db.task.findFirst({
      where: { id: entityId, organizationId },
      select: { frequency: true },
    });
    if (task?.frequency) until = computeNextTaskReviewDate(task.frequency, from);
  }
  if (until && until <= from) {
    throw new BadRequestException('validUntil must be after validFrom');
  }
  return { validFrom: from, validUntil: until };
}

/** Changes a file's validity window (org-scoped). */
export async function updateAttachmentValidity({
  organizationId,
  attachmentId,
  validFrom,
  validUntil,
}: {
  organizationId: string;
  attachmentId: string;
  validFrom?: string;
  /** null clears the end date (valid until replaced). */
  validUntil?: string | null;
}) {
  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, organizationId },
    select: { id: true, createdAt: true, validFrom: true, validUntil: true },
  });
  if (!attachment) throw new BadRequestException('Attachment not found');

  const from = validFrom
    ? parseDay(validFrom, 'validFrom')
    : (attachment.validFrom ?? attachment.createdAt);
  const until =
    validUntil === undefined
      ? attachment.validUntil
      : validUntil === null
        ? null
        : parseDay(validUntil, 'validUntil');
  if (until && until <= from) {
    throw new BadRequestException('validUntil must be after validFrom');
  }

  return db.attachment.update({
    where: { id: attachment.id },
    data: { validFrom: from, validUntil: until },
    select: { id: true, validFrom: true, validUntil: true },
  });
}
