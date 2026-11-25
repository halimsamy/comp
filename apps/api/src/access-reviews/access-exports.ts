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

const roleKey = (systemKey: string, role: string) =>
  `${systemKey}\u0000${role.trim().toLowerCase()}`;

/**
 * Active privileged accounts across every system, for the auditor export and
 * the Accounts tab (#97): admins, plus holders of a role the approved role
 * catalog marks privileged on that system.
 */
export async function listPrivilegedAccounts(
  organizationId: string,
  accounts: AccessAccountsService = createAccessAccountsService(),
) {
  const [all, privilegedRoles] = await Promise.all([
    accounts.listAllAccounts(organizationId),
    db.accessSystemRole.findMany({
      where: { organizationId, isPrivileged: true },
      select: { systemKey: true, name: true },
    }),
  ]);
  const privileged = new Set(
    privilegedRoles.map((r) => roleKey(r.systemKey, r.name)),
  );
  return all.flatMap(({ system, accounts: rows }) =>
    rows
      .filter(
        (a) =>
          a.status === 'active' &&
          (a.isAdmin || a.roles.some((r) => privileged.has(roleKey(system.key, r)))),
      )
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
