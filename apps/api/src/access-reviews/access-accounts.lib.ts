import { z } from 'zod';
import type { CheckResultRow } from '../integration-platform/services/check-results.service';

/**
 * Standard account-row contract. Account inventory checks (bound to the
 * Employee Access task) emit one `resourceType: 'user'` row per account with
 * `resourceId` = lowercased email (or a provider id when there is no email)
 * and evidence carrying these keys:
 *   accountName, email, type ('human' | 'service'), status ('active' |
 *   'suspended' | 'deactivated'), mfa (boolean), roles (string[]), isAdmin,
 *   createdAt, lastLoginAt (ISO strings).
 * Google Workspace's older field names are read too.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  schema.optional().catch(undefined);
const AccountEvidence = z.object({
  accountName: optional(z.string()),
  name: optional(z.string()),
  username: optional(z.string()),
  email: optional(z.string()),
  type: optional(z.string()),
  status: optional(z.string()),
  suspended: optional(z.boolean()),
  roles: optional(z.array(z.string())),
  role: optional(z.string()),
  isAdmin: optional(z.boolean()),
  isDelegatedAdmin: optional(z.boolean()),
  mfa: optional(z.boolean()),
  isEnrolledIn2Sv: optional(z.boolean()),
  lastLoginAt: optional(z.string()),
  lastLoginTime: optional(z.string()),
  createdAt: optional(z.string()),
  creationTime: optional(z.string()),
});

export const ACCESS_FLAGS = [
  'owner_departed',
  'unmapped',
  'admin',
  'no_mfa',
  'inactive',
  'no_activity',
  'role_not_approved',
  'admin_role_unapproved',
  'type_not_allowed',
] as const;
export type AccessFlag = (typeof ACCESS_FLAGS)[number];

/** PCI DSS 8.2.6: inactive accounts are removed or disabled within 90 days. */
export const INACTIVE_DAYS = 90;

export interface BaseAccount {
  accountId: string;
  name: string;
  email: string | null;
  type: string | null;
  status: string;
  roles: string[];
  isAdmin: boolean;
  mfaEnabled: boolean | null;
  lastLoginAt: Date | null;
  accountCreatedAt: Date | null;
}

export interface AccountOwner {
  memberId: string;
  name: string;
  email: string;
  departed: boolean;
}

export interface InventoryAccount extends BaseAccount {
  owner: AccountOwner | null;
  ownerSource: 'email' | 'manual' | null;
  isServiceAccount: boolean;
  justification: string | null;
  flags: AccessFlag[];
}

/** Parse a date string; the Unix epoch means "never" in Google Workspace. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return null;
  return date;
}

export function accountFromCheckRow(row: CheckResultRow): BaseAccount {
  const parsed = AccountEvidence.safeParse(row.evidence);
  const ev = parsed.success ? parsed.data : {};
  const email =
    ev.email?.toLowerCase().trim() ||
    (row.resourceId.includes('@') ? row.resourceId : null);
  const roles = ev.roles ?? (ev.role ? [ev.role] : []);
  const status = ev.status ?? (ev.suspended ? 'suspended' : 'active');
  return {
    accountId: row.resourceId,
    name: ev.accountName ?? ev.name ?? ev.username ?? row.resourceId,
    email,
    type: ev.type ?? null,
    status,
    roles,
    isAdmin: Boolean(ev.isAdmin || ev.isDelegatedAdmin),
    mfaEnabled: ev.mfa ?? ev.isEnrolledIn2Sv ?? null,
    lastLoginAt: parseDate(ev.lastLoginAt ?? ev.lastLoginTime),
    accountCreatedAt: parseDate(ev.createdAt ?? ev.creationTime),
  };
}

export type AccountTypeKey = 'human' | 'service' | 'shared';
export const ACCOUNT_TYPES: AccountTypeKey[] = ['human', 'service', 'shared'];
export type AllowedAccountTypes = Partial<
  Record<AccountTypeKey, { allowed: boolean; justification?: string | null }>
>;

const AllowedType = z
  .object({ allowed: z.boolean(), justification: z.string().nullish() })
  .optional()
  .catch(undefined);
export const AllowedAccountTypesSchema = z
  .object({ human: AllowedType, service: AllowedType, shared: AllowedType })
  .catch({});

/** Approved roles of one system (#159). Empty = no role catalog yet, so nothing is flagged. */
export interface SystemPolicy {
  approvedRoles: { name: string; isPrivileged: boolean }[];
  allowedTypes: AllowedAccountTypes;
}

const olderThan = (date: Date, now: Date) =>
  now.getTime() - date.getTime() > INACTIVE_DAYS * 86_400_000;

/** Pre-flags shown to reviewers (owner gone, unmapped, admin, no MFA, inactive, roles and types). */
export function accountFlags({
  account,
  owner,
  isServiceAccount,
  justification,
  policy,
  now,
}: {
  account: BaseAccount;
  owner: AccountOwner | null;
  isServiceAccount: boolean;
  justification?: string | null;
  policy?: SystemPolicy;
  now: Date;
}): AccessFlag[] {
  const active = account.status === 'active';
  const flags: AccessFlag[] = [];
  if (active && owner?.departed) flags.push('owner_departed');
  // PCI DSS 8.2.2: a service account needs an owner or a documented justification too.
  if (active && !owner && !(isServiceAccount && justification?.trim())) {
    flags.push('unmapped');
  }
  if (account.isAdmin) flags.push('admin');
  if (active && account.mfaEnabled === false) flags.push('no_mfa');
  if (active && account.lastLoginAt && olderThan(account.lastLoginAt, now)) {
    flags.push('inactive');
  }
  if (
    active &&
    !account.lastLoginAt &&
    account.accountCreatedAt &&
    olderThan(account.accountCreatedAt, now)
  ) {
    flags.push('no_activity');
  }
  const roles = policy?.approvedRoles ?? [];
  if (roles.length > 0) {
    const approved = new Map(roles.map((r) => [r.name.toLowerCase(), r]));
    if (account.roles.some((r) => !approved.has(r.toLowerCase()))) {
      flags.push('role_not_approved');
    }
    if (
      account.isAdmin &&
      !account.roles.some((r) => approved.get(r.toLowerCase())?.isPrivileged)
    ) {
      flags.push('admin_role_unapproved');
    }
  }
  const type: AccountTypeKey = isServiceAccount || account.type === 'service'
    ? 'service'
    : account.type === 'shared'
      ? 'shared'
      : 'human';
  if (policy?.allowedTypes[type]?.allowed === false) {
    flags.push('type_not_allowed');
  }
  return flags;
}

export type SystemKind = 'platform' | 'integration' | 'manual';

export const SYSTEM_KEY_PATTERN = /^(compai|connection:[\w-]+|manual:[\w-]+)$/;

export function parseSystemKey(
  key: string,
): { kind: SystemKind; id: string | null } | null {
  if (!SYSTEM_KEY_PATTERN.test(key)) return null;
  if (key === 'compai') return { kind: 'platform', id: null };
  const [prefix, id] = key.split(':');
  return {
    kind: prefix === 'manual' ? 'manual' : 'integration',
    id: id ?? null,
  };
}
