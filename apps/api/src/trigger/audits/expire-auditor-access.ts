import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { isAuditorOnly } from '../../audits/audit-access';
import { deactivateMember } from '../../people/utils/member-deactivation';

/**
 * Time-boxed auditor access: an auditor-only member is deactivated (and signed
 * out) once every audit they are assigned to is past its access end date.
 * Members with any other role keep their access.
 */
export async function expireAuditorAccess(now = new Date()) {
  const grants = await db.auditEngagementAuditor.findMany({
    where: { audit: { accessEndsAt: { lt: now } }, member: { deactivated: false } },
    select: {
      member: {
        select: {
          id: true,
          role: true,
          userId: true,
          organizationId: true,
          auditGrants: { select: { audit: { select: { accessEndsAt: true } } } },
        },
      },
    },
  });

  const members = new Map(grants.map((g) => [g.member.id, g.member]));
  let deactivated = 0;
  for (const member of members.values()) {
    const roles = member.role.split(',').map((r) => r.trim()).filter(Boolean);
    if (!isAuditorOnly(roles)) continue;
    const allEnded = member.auditGrants.every(
      ({ audit }) => audit.accessEndsAt !== null && audit.accessEndsAt < now,
    );
    if (!allEnded) continue;
    await deactivateMember({
      memberId: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      skipOffboarding: true,
    });
    deactivated++;
  }

  logger.info('Expired auditor access', { checked: members.size, deactivated });
  return { checked: members.size, deactivated };
}

export const expireAuditorAccessSchedule = schedules.task({
  id: 'expire-auditor-access-schedule',
  cron: '30 0 * * *', // daily 00:30 UTC, just after an access end date passes
  maxDuration: 10 * 60, // seconds
  run: () => expireAuditorAccess(),
});
