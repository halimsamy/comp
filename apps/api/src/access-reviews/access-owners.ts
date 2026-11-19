import { db } from '@db';
import {
  accountFlags,
  AllowedAccountTypesSchema,
  type AccountOwner,
  type BaseAccount,
  type InventoryAccount,
  type SystemPolicy,
} from './access-accounts.lib';

/** Members by id and email, plus manual owner mappings keyed by system|account. */
export interface OwnerContext {
  byId: Map<string, AccountOwner>;
  byEmail: Map<string, AccountOwner>;
  overrides: Map<
    string,
    {
      memberId: string | null;
      isServiceAccount: boolean;
      justification: string | null;
    }
  >;
  /** Approved roles and allowed account types per system key. */
  policies: Map<string, SystemPolicy>;
}

export async function loadOwnerContext(
  organizationId: string,
): Promise<OwnerContext> {
  const now = Date.now();
  const [members, overrides, roles, systems] = await Promise.all([
    db.member.findMany({
      where: { organizationId },
      select: {
        id: true,
        deactivated: true,
        offboardDate: true,
        user: { select: { name: true, email: true } },
      },
    }),
    db.accessAccountOwner.findMany({ where: { organizationId } }),
    db.accessSystemRole.findMany({
      where: { organizationId },
      select: { systemKey: true, name: true, isPrivileged: true },
    }),
    db.accessSystem.findMany({
      where: { organizationId },
      select: { id: true, allowedAccountTypes: true },
    }),
  ]);
  const policies = new Map<string, SystemPolicy>();
  const policyFor = (key: string) => {
    const existing = policies.get(key);
    if (existing) return existing;
    const created: SystemPolicy = { approvedRoles: [], allowedTypes: {} };
    policies.set(key, created);
    return created;
  };
  for (const role of roles) policyFor(role.systemKey).approvedRoles.push(role);
  for (const system of systems) {
    policyFor(`manual:${system.id}`).allowedTypes = AllowedAccountTypesSchema.parse(
      system.allowedAccountTypes ?? {},
    );
  }
  const byId = new Map<string, AccountOwner>();
  const byEmail = new Map<string, AccountOwner>();
  for (const m of members) {
    const owner: AccountOwner = {
      memberId: m.id,
      name: m.user.name || m.user.email,
      email: m.user.email,
      departed:
        m.deactivated ||
        Boolean(m.offboardDate && m.offboardDate.getTime() <= now),
    };
    byId.set(m.id, owner);
    byEmail.set(m.user.email.toLowerCase().trim(), owner);
  }
  return {
    byId,
    byEmail,
    overrides: new Map(
      overrides.map((o) => [`${o.systemKey}|${o.accountId}`, o]),
    ),
    policies,
  };
}

export function decorateAccounts({
  systemKey,
  accounts,
  owners,
  now,
}: {
  systemKey: string;
  accounts: BaseAccount[];
  owners: OwnerContext;
  now: Date;
}): InventoryAccount[] {
  return accounts.map((account) => {
    const override = owners.overrides.get(`${systemKey}|${account.accountId}`);
    const manualOwner = override?.memberId
      ? (owners.byId.get(override.memberId) ?? null)
      : null;
    const emailOwner =
      !override && account.email
        ? (owners.byEmail.get(account.email) ?? null)
        : null;
    const owner = manualOwner ?? emailOwner;
    const isServiceAccount =
      override?.isServiceAccount ?? account.type === 'service';
    const justification = override?.justification ?? null;
    return {
      ...account,
      owner,
      ownerSource: manualOwner ? 'manual' : emailOwner ? 'email' : null,
      isServiceAccount,
      justification,
      flags: accountFlags({
        account,
        owner,
        isServiceAccount,
        justification,
        policy: owners.policies.get(systemKey),
        now,
      }),
    };
  });
}
