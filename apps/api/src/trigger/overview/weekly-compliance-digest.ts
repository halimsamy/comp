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

/** Program owners get the digest: members holding the owner or admin role. */
export function isDigestRecipient(role: string): boolean {
  return role.split(',').some((r) => ['owner', 'admin'].includes(r.trim()));
}

async function sendDigestForOrg({
  organization,
  now,
}: {
  organization: { id: string; name: string; isInternal: boolean };
  now: Date;
}): Promise<number> {
  const data = await loadOverviewData({ organizationId: organization.id });
  const cards = buildAttentionCards({ data, now });
  const deadlines = buildDeadlines({ data, now });
  if (
    deadlines.overdueCount + deadlines.dueSoonCount === 0 &&
    cards.every((c) => c.needsAttention === 0)
  ) {
    return 0;
  }

  const members = await db.member.findMany({
    where: {
      organizationId: organization.id,
      deactivated: false,
      isActive: true,
    },
    select: {
      role: true,
      user: { select: { name: true, email: true, role: true } },
    },
  });
  const day = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const member of members) {
    if (!isDigestRecipient(member.role) || !member.user.email) continue;
    if (
      !isOrgParticipant(member.user.role, {
        orgIsInternal: organization.isInternal,
      })
    )
      continue;
    const unsubscribed = await isUserUnsubscribed(
      db,
      member.user.email,
      'weeklyTaskDigest',
      organization.id,
    );
    if (unsubscribed) continue;
    await triggerEmail({
      to: member.user.email,
      subject: `Weekly compliance digest: ${deadlines.overdueCount} overdue, ${deadlines.dueSoonCount} due soon`,
      react: WeeklyComplianceDigestEmail({
        userName: member.user.name || member.user.email,
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
        windowDays: deadlines.windowDays,
        email: member.user.email,
      }),
      idempotencyKey: `weekly-compliance-digest:${organization.id}:${member.user.email}:${day}`,
    });
    sent++;
  }
  return sent;
}

/** Monday email to program owners with the overview's needs-attention cards and deadline queue. */
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
      logger.error('Failed to send weekly compliance digest', {
        organizationId: organization.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Weekly compliance digests sent', {
    organizations: organizations.length,
    emails,
  });
  return { organizations: organizations.length, emails };
}

export const weeklyComplianceDigest = schedules.task({
  id: 'weekly-compliance-digest',
  cron: '0 8 * * 1', // Mondays 08:00 UTC
  maxDuration: 30 * 60,
  run: () => sendWeeklyComplianceDigests(),
});
