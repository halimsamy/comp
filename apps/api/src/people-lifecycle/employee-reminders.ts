import { Logger } from '@nestjs/common';
import { db } from '@db';
import { isUserUnsubscribed } from '@trycompai/email';
import { triggerEmail } from '../email/trigger-email';
import { EmployeeSecurityTasksEmail } from '../email/templates/employee-security-tasks';
import { buildOrgCompliance, type MemberCompliance } from './org-compliance';

const logger = new Logger('EmployeeReminders');

/** Obligations the employee completes themselves in the portal. */
const EMPLOYEE_ITEMS = new Set(['policies', 'training', 'role_training', 'device']);
const OPEN = new Set(['incomplete', 'in_progress', 'overdue', 'expired']);

export type ReminderFrequency = 'off' | 'weekly' | 'daily';
export const REMINDER_FREQUENCIES: ReminderFrequency[] = ['off', 'weekly', 'daily'];

const portalBase = () =>
  (process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.trycomp.ai').replace(/\/+$/, '');

/** The employee's open portal tasks, or none when they are done or have left. */
export function openEmployeeTasks(entry: MemberCompliance) {
  if (entry.member.former || entry.member.deactivated) return [];
  return entry.items.filter((i) => EMPLOYEE_ITEMS.has(i.key) && OPEN.has(i.status));
}

/**
 * #162: one "Your security tasks" email per member with open items. It folds
 * in the pending-policy digest. Manual sends (with an actor) are audit-logged.
 */
export async function sendSecurityTaskReminders({
  organizationId,
  memberIds,
  actor,
  now = new Date(),
}: {
  organizationId: string;
  /** Omit for everyone with open tasks. */
  memberIds?: string[];
  /** Who pressed "Send reminder"; omitted for the scheduled run. */
  actor?: { userId: string; memberId?: string };
  now?: Date;
}) {
  const [org, compliance] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    buildOrgCompliance({ organizationId, now }),
  ]);
  const wanted = memberIds ? new Set(memberIds) : null;
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  for (const entry of compliance) {
    if (wanted && !wanted.has(entry.member.id)) continue;
    const tasks = openEmployeeTasks(entry);
    if (tasks.length === 0) {
      skipped++;
      continue;
    }
    if (await isUserUnsubscribed(db, entry.member.email, 'policyNotifications', organizationId)) {
      skipped++;
      continue;
    }
    try {
      await triggerEmail({
        to: entry.member.email,
        subject: `Your security tasks for ${org?.name ?? 'your organization'}`,
        system: true,
        // The schedule may retry within a day; a manual send always goes out.
        ...(!actor && { idempotencyKey: `employee-security-tasks-${entry.member.id}-${day}` }),
        react: EmployeeSecurityTasksEmail({
          toName: entry.member.name ?? '',
          organizationName: org?.name ?? 'your organization',
          portalUrl: `${portalBase()}/${organizationId}`,
          tasks: tasks.map((t) => ({ title: t.title, detail: t.detail })),
          policies: entry.pendingPolicies.map((p) => ({
            name: p.name,
            url: `${portalBase()}/${organizationId}/policy/${p.id}`,
          })),
        }),
      });
      sent++;
    } catch (error) {
      logger.warn(`Reminder to member ${entry.member.id} failed: ${String(error)}`);
      skipped++;
      continue;
    }
    if (actor) {
      await db.auditLog.create({
        data: {
          organizationId,
          userId: actor.userId,
          memberId: actor.memberId ?? null,
          entityType: 'people',
          entityId: entry.member.id,
          description: `sent a security tasks reminder to ${entry.member.name ?? entry.member.email}`,
          data: {
            action: 'personnel_reminder_sent',
            recipient: entry.member.email,
            tasks: tasks.map((t) => t.key),
          },
        },
      });
    }
  }
  return { sent, skipped };
}
