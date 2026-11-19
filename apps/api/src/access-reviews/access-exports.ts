import { db } from '@db';
import {
  createAccessAccountsService,
  type AccessAccountsService,
} from './access-accounts.service';

/** Approved role catalog of every system, for the auditor export (#159). */
export function listAccessRoles(organizationId: string) {
  return db.accessSystemRole.findMany({
    where: { organizationId },
    orderBy: [{ systemName: 'asc' }, { name: 'asc' }],
    select: {
      systemKey: true,
      systemName: true,
      name: true,
      permissionsScope: true,
      isPrivileged: true,
      approvedByName: true,
      approvedAt: true,
      lastReviewedAt: true,
    },
  });
}

/** Active admin accounts across every system, for the auditor export and the Accounts tab (#97). */
export async function listPrivilegedAccounts(
  organizationId: string,
  accounts: AccessAccountsService = createAccessAccountsService(),
) {
  const all = await accounts.listAllAccounts(organizationId);
  return all.flatMap(({ system, accounts: rows }) =>
    rows
      .filter((a) => a.isAdmin && a.status === 'active')
      .map((a) => ({
        systemKey: system.key,
        systemName: system.name,
        accountId: a.accountId,
        name: a.name,
        email: a.email,
        ownerName: a.owner?.name ?? (a.isServiceAccount ? 'Service account' : null),
        roles: a.roles,
        mfaEnabled: a.mfaEnabled,
        lastLoginAt: a.lastLoginAt,
        flags: a.flags,
      })),
  );
}
