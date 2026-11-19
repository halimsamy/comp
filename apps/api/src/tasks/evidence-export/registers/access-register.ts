import { db } from '@db';
import {
  listAccessRoles,
  listPrivilegedAccounts,
} from '../../../access-reviews/access-exports';
import { humanize, toCsv, type RegisterParams } from './register-csv';

/**
 * User access review campaigns, one row per reviewed system (ISO 27001
 * A.5.15, A.5.18, A.8.2; PCI DSS 7.2.4, 7.2.5.1, 8.2.6).
 */
export async function buildAccessReviewsCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const reviews = await db.accessReview.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      systems: { orderBy: { systemName: 'asc' } },
      items: {
        select: { reviewSystemId: true, decision: true, remediatedAt: true },
      },
    },
  });

  return toCsv({
    headers: [
      'Campaign',
      'Status',
      'System',
      'Reviewer',
      'Due',
      'Signed off by',
      'Signed off at',
      'Accounts',
      'Kept',
      'Revoked',
      'Modified',
      'Undecided',
      'Changes remediated',
      'Changes pending',
    ],
    rows: reviews.flatMap((review) =>
      review.systems.map((system) => {
        const items = review.items.filter((i) => i.reviewSystemId === system.id);
        const count = (decision: string | null) =>
          items.filter((i) => i.decision === decision).length;
        const changes = items.filter(
          (i) => i.decision === 'revoke' || i.decision === 'modify',
        );
        const remediated = changes.filter((i) => i.remediatedAt).length;
        return [
          review.name,
          humanize(review.status),
          system.systemName,
          system.reviewerName,
          review.dueDate,
          review.signedOffByName,
          review.signedOffAt,
          items.length,
          count('keep'),
          count('revoke'),
          count('modify'),
          count(null),
          remediated,
          changes.length - remediated,
        ];
      }),
    ),
  });
}

/** Active admin accounts across every system (ISO 27001 A.8.2; PCI DSS 7.2.2, 7.2.4). */
export async function buildPrivilegedUsersCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const accounts = await listPrivilegedAccounts(organizationId);
  return toCsv({
    headers: [
      'System',
      'Account',
      'Email',
      'Owner',
      'Roles',
      'MFA',
      'Last login',
      'Flags',
    ],
    rows: accounts.map((a) => [
      a.systemName,
      a.name ?? a.accountId,
      a.email,
      a.ownerName,
      a.roles.join('; '),
      a.mfaEnabled,
      a.lastLoginAt,
      a.flags.join('; '),
    ]),
  });
}

/** Approved role catalog per system (ISO 27001 A.5.15, A.8.2; PCI DSS 7.2.1-7.2.3). */
export async function buildAccessRolesCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const roles = await listAccessRoles(organizationId);
  return toCsv({
    headers: [
      'System',
      'Role',
      'Permissions',
      'Privileged',
      'Approved by',
      'Approved at',
      'Last reviewed',
    ],
    rows: roles.map((r) => [
      r.systemName,
      r.name,
      r.permissionsScope,
      r.isPrivileged,
      r.approvedByName,
      r.approvedAt,
      r.lastReviewedAt,
    ]),
  });
}
