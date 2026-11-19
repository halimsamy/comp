import { db } from '@db';
import type { ReminderFrequency } from './employee-reminders';

const DAY_MS = 86_400_000;

export async function getReminderFrequency(organizationId: string): Promise<ReminderFrequency> {
  const row = await db.employeeReminderSetting.findUnique({
    where: { organizationId },
    select: { frequency: true },
  });
  const value = row?.frequency;
  return value === 'off' || value === 'daily' ? value : 'weekly';
}

export function setReminderFrequency({
  organizationId,
  frequency,
}: {
  organizationId: string;
  frequency: ReminderFrequency;
}) {
  return db.employeeReminderSetting.upsert({
    where: { organizationId },
    create: { organizationId, frequency },
    update: { frequency },
    select: { frequency: true, lastSentAt: true },
  });
}

/** Whether the scheduled reminder is due: daily every day, weekly after six and a half days. */
export function reminderDue({
  frequency,
  lastSentAt,
  now,
}: {
  frequency: ReminderFrequency;
  lastSentAt: Date | null;
  now: Date;
}): boolean {
  if (frequency === 'off') return false;
  if (!lastSentAt) return true;
  const gap = frequency === 'daily' ? 0.5 * DAY_MS : 6.5 * DAY_MS;
  return now.getTime() - lastSentAt.getTime() >= gap;
}
