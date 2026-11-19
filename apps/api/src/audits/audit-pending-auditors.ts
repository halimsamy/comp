import { db } from '@db';
import type { AuthContext } from '../auth/types';

/** Lower-cased, de-duplicated invited auditor emails. */
export function normalizeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

/**
 * An auditor invited by email from the audit sheet is assigned to that audit
 * the first time they open Audits after joining (#109). Only members holding
 * the auditor role are assigned, so the invite cannot widen anyone else's access.
 */
export async function claimPendingAuditorAssignments(auth: AuthContext): Promise<void> {
  const email = auth.userEmail?.toLowerCase();
  const memberId = auth.memberId;
  if (!email || !memberId || !auth.userRoles?.includes('auditor')) return;
  const audits = await db.auditEngagement.findMany({
    where: { organizationId: auth.organizationId, pendingAuditorEmails: { has: email } },
    select: { id: true, pendingAuditorEmails: true },
  });
  for (const audit of audits) {
    await db.$transaction([
      db.auditEngagementAuditor.createMany({
        data: [{ auditId: audit.id, memberId }],
        skipDuplicates: true,
      }),
      db.auditEngagement.update({
        where: { id: audit.id },
        data: {
          pendingAuditorEmails: audit.pendingAuditorEmails.filter((pending) => pending !== email),
        },
      }),
    ]);
  }
}
