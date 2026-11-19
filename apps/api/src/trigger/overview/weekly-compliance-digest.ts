import { db } from '@db';
import { isOrgParticipant } from '@trycompai/auth';
import { isUserUnsubscribed } from '@trycompai/email';
import { logger, schedules } from '@trycompai/jobs';
import { triggerEmail } from '../../email/trigger-email';
import { WeeklyComplianceDigestEmail } from '../../email/templates/weekly-compliance-digest';
import { buildAttentionCards } from '../../overview/overview-attention';
import { loadOverviewData } from '../../overview/overview-data';
import { buildDeadlines } from '../../overview/overview-deadlines';

const MAX_ITEMS = 10;
const ORG_INACTIVITY_DAYS = 90;

export type DigestFrequency = 'daily' | 'weekly';

/** Program owners get the digest: members holding the owner or admin role. */
export function isDigestRecipient(role: string): boolean {
  return role.split(',').some((r) => ['owner', 'admin'].includes(r.trim()));
}

/** The user's compliance digest cadence from User.emailPreferences (default weekly). */
export function complianceDigestFrequency(preferences: unknown): DigestFrequency {
  if (!preferences || typeof preferences !== 'object') return 'weekly';
  return 'complianceDigestFrequency' in preferences &&
    preferences.complianceDigestFrequency === 'daily'
    ? 'daily'
    : 'weekly';
}

/** Weekly digests go out on Mondays (UTC), when the task digest is combined into them. */
export const isMonday = (now: Date) => now.getUTCDay() === 1;

async function sendDigestForOrg({
  organization,
  now,
}: {
  organization: { id: string; name: string; isInternal: boolean };
  now: Date;
}): Promise<number> {
  const members = await db.member.findMany({
    where: {
      organizationId: organization.id,
      deactivated: false,
      isActive: true,
    },
    select: {
      id: true,
      role: true,
      user: {
        select: { name: true, email: true, role: true, emailPreferences: true },
      },
    },
  });
  const monday = isMonday(now);
  const recipients = members.filter(
    (member) =>
      member.user.email &&
      isDigestRecipient(member.role) &&
      isOrgParticipant(member.user.role, {
        orgIsInternal: organization.isInternal,
      }) &&
      (monday ||
        complianceDigestFrequency(member.user.emailPreferences) === 'daily'),
  );
  if (recipients.length === 0) return 0;

  const data = await loadOverviewData({ organizationId: organization.id });
  const cards = buildAttentionCards({ data, now });
  const deadlines = buildDeadlines({ data, now });
  if (
    deadlines.overdueCount + deadlines.dueSoonCount === 0 &&
    cards.every((c) => c.needsAttention === 0)
  ) {
    return 0;
  }

  const day = now.toISOString().slice(0, 10);
  const openTasks = data.tasks.filter(
    (t) => t.status === 'todo' || t.status === 'in_progress',
  );
  let sent = 0;
  for (const member of recipients) {
    const email = member.user.email;
    const frequency = complianceDigestFrequency(member.user.emailPreferences);
    if (
      await isUserUnsubscribed(db, email, 'complianceDigest', organization.id)
    )
      continue;
    // #10: on Mondays the task digest rides along in this email (the task job skips these members).
    const withTasks =
      monday &&
      !(await isUserUnsubscribed(db, email, 'weeklyTaskDigest', organization.id));
    const tasks = withTasks
      ? openTasks
          .filter((t) => t.assigneeId === member.id || !t.assigneeId)
          .map(({ id, title }) => ({ id, title }))
      : [];
    const label = frequency === 'daily' ? 'Daily' : 'Weekly';
    await triggerEmail({
      to: email,
      subject: `${label} compliance digest: ${deadlines.overdueCount} overdue, ${deadlines.dueSoonCount} due soon`,
      react: WeeklyComplianceDigestEmail({
        frequency,
        userName: member.user.name || email,
        organizationName: organization.name,
        organizationId: organization.id,
        cards: cards.map(({ label, needsAttention, href }) => ({
          label,
          needsAttention,
          href,
        })),
        overdue: deadlines.overdue.slice(0, MAX_ITEMS),
        overdueCount: deadlines.overdueCount,
        dueSoon: deadlines.dueSoon.slice(0, MAX_ITEMS),
        dueSoonCount: deadlines.dueSoonCount,
        noDueDateCount: deadlines.noDueDateCount,
        windowDays: deadlines.windowDays,
        tasks: tasks.slice(0, MAX_ITEMS),
        tasksCount: tasks.length,
        email,
      }),
      idempotencyKey: `weekly-compliance-digest:${organization.id}:${email}:${day}`,
    });
    sent++;
  }
  return sent;
}

/** Daily run: daily subscribers every day, weekly ones on Mondays, with the overview cards and deadline queue. */
export async function sendWeeklyComplianceDigests(now = new Date()) {
  const inactivityCutoff = new Date(
    now.getTime() - ORG_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
  );
  const organizations = await db.organization.findMany({
    where: {
      hasAccess: true,
      onboardingCompleted: true,
      members: {
        some: {
          deactivated: false,
          user: {
            sessions: { some: { updatedAt: { gte: inactivityCutoff } } },
          },
        },
      },
    },
    select: { id: true, name: true, isInternal: true },
  });
  let emails = 0;
  for (const organization of organizations) {
    try {
      emails += await sendDigestForOrg({ organization, now });
    } catch (error) {
      logger.error('Failed to send compliance digest', {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Compliance digests sent', {
    organizations: organizations.length,
    emails,
  });
  return { organizations: organizations.length, emails };
}

export const weeklyComplianceDigest = schedules.task({
  id: 'weekly-compliance-digest',
  cron: '0 8 * * *', // Daily 08:00 UTC; weekly subscribers only on Mondays
  maxDuration: 30 * 60,
  run: () => sendWeeklyComplianceDigests(),
});
