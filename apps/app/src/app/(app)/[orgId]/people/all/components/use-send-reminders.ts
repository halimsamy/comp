'use client';

import { api } from '@/lib/api-client';
import { toast } from 'sonner';

/** #162: "Send reminder" for one member, or everyone with open security tasks. */
export async function sendSecurityReminders(memberIds?: string[]) {
  const response = await api.post<{ sent: number; skipped: number }>('/v1/people-lifecycle/reminders', {
    ...(memberIds && { memberIds }),
  });
  if (response.error || !response.data) {
    toast.error(response.error ?? 'Failed to send reminders');
    return;
  }
  const { sent } = response.data;
  toast.success(
    sent === 0
      ? 'Nobody had open security tasks, so no reminder was sent'
      : sent === 1
        ? 'Reminder sent'
        : `${sent} reminders sent`,
  );
}
