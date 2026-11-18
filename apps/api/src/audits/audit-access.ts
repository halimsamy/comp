import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { db, type Prisma } from '@db';
import type { AuthContext } from '../auth/types';

/** Members whose only role is the built-in auditor (external audit firm staff). */
export function isAuditorOnly(roles: string[] | null): boolean {
  return !!roles && roles.length > 0 && roles.every((role) => role === 'auditor');
}

/**
 * Audits the caller may see. Auditor-only members see only the audits they are
 * assigned to, and only until the audit's access end date.
 */
export function visibleAuditsWhere(
  auth: AuthContext,
  now: Date = new Date(),
): Prisma.AuditEngagementWhereInput {
  const where: Prisma.AuditEngagementWhereInput = { organizationId: auth.organizationId };
  if (!isAuditorOnly(auth.userRoles)) return where;
  return {
    ...where,
    auditors: { some: { memberId: auth.memberId ?? '' } },
    OR: [{ accessEndsAt: null }, { accessEndsAt: { gte: now } }],
  };
}

export async function getVisibleAudit({
  auth,
  auditId,
}: {
  auth: AuthContext;
  auditId: string;
}) {
  const audit = await db.auditEngagement.findFirst({
    where: { id: auditId, ...visibleAuditsWhere(auth) },
    include: { auditors: { select: { memberId: true } } },
  });
  if (!audit) throw new NotFoundException('Audit not found');
  return audit;
}

/** Assessments and evidence requests come only from the audit's own auditors. */
export function assertAssignedAuditor({
  audit,
  auth,
}: {
  audit: { auditors: Array<{ memberId: string }> };
  auth: AuthContext;
}): string {
  const memberId = auth.memberId;
  if (!memberId || !audit.auditors.some((a) => a.memberId === memberId)) {
    throw new ForbiddenException('Only an auditor assigned to this audit can do this');
  }
  return memberId;
}

/** Team-side actions (respond to requests) are not for the external auditors. */
export function assertTeamMember(auth: AuthContext): void {
  if (isAuditorOnly(auth.userRoles)) {
    throw new ForbiddenException('Auditors cannot respond to their own requests');
  }
}
