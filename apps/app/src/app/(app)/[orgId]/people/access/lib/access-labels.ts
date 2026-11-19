import type { AccessAccount, AccessDecision, AccessFlag } from '@/hooks/use-access-reviews';

export const FLAG_LABEL: Record<AccessFlag, string> = {
  owner_departed: 'Owner left',
  unmapped: 'No owner',
  admin: 'Admin',
  no_mfa: 'No MFA',
  inactive: 'Inactive 90+ days',
  no_activity: 'Never used',
  role_not_approved: 'Role not approved',
  admin_role_unapproved: 'Admin without approved role',
  type_not_allowed: 'Type not allowed',
};

export const FLAG_HINT: Record<AccessFlag, string> = {
  owner_departed: 'The owner is offboarded but the account is still active',
  unmapped: 'No member owns this account. Map it or mark it a service account',
  admin: 'Privileged account. Confirm the access is still needed',
  no_mfa: 'MFA is off for this account',
  inactive: 'No sign-in for more than 90 days (PCI DSS 8.2.6)',
  no_activity: 'Created more than 90 days ago and never signed in (PCI DSS 8.2.6)',
  role_not_approved: 'Holds a role that is not in this system’s approved roles (PCI DSS 7.2.1)',
  admin_role_unapproved: 'Admin access without an approved privileged role (PCI DSS 7.2.2)',
  type_not_allowed: 'This account type is not allowed on the system (PCI DSS 8.2.2)',
};

export const DECISION_LABEL: Record<AccessDecision, string> = {
  keep: 'Keep',
  revoke: 'Revoke',
  modify: 'Modify',
};

export const ACCOUNT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'owner_departed', label: 'Owner left' },
  { value: 'unmapped', label: 'No owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'no_mfa', label: 'No MFA' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'no_activity', label: 'Never used' },
  { value: 'role_not_approved', label: 'Role not approved' },
  { value: 'type_not_allowed', label: 'Type not allowed' },
] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number]['value'];

/** Filter anything with `flags` (inventory accounts and review items) by flag and search text. */
export function filterByFlag<T extends { flags: AccessFlag[] }>({
  rows,
  filter,
}: {
  rows: T[];
  filter: AccountFilter;
}): T[] {
  if (filter === 'all') return rows;
  if (filter === 'flagged') return rows.filter((row) => row.flags.length > 0);
  return rows.filter((row) => row.flags.includes(filter));
}

export function matchesSearch({ values, query }: { values: (string | null)[]; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value?.toLowerCase().includes(q));
}

export const formatDay = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';

export const mfaLabel = (value: boolean | null) => (value === null ? 'Unknown' : value ? 'On' : 'Off');

export const ownerLabel = (account: Pick<AccessAccount, 'owner' | 'isServiceAccount'>) =>
  account.owner?.name ?? (account.isServiceAccount ? 'Service account' : 'Unmapped');

/** The next half-year review name not already used, e.g. "H2 2026 access review" (#98). */
export function nextReviewName({ existing, now = new Date() }: { existing: string[]; now?: Date }) {
  const used = new Set(existing.map((n) => n.trim().toLowerCase()));
  let year = now.getFullYear();
  let half = now.getMonth() < 6 ? 1 : 2;
  for (let i = 0; i < 20; i++) {
    const name = `H${half} ${year} access review`;
    if (!used.has(name.toLowerCase())) return name;
    half = half === 1 ? 2 : 1;
    if (half === 1) year++;
  }
  return `Access review ${now.toISOString().slice(0, 10)}`;
}
