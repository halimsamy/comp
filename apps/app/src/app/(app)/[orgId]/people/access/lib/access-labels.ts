import type { AccessAccount, AccessDecision, AccessFlag } from '@/hooks/use-access-reviews';

export const FLAG_LABEL: Record<AccessFlag, string> = {
  owner_departed: 'Owner left',
  unmapped: 'No owner',
  admin: 'Admin',
  no_mfa: 'No MFA',
  inactive: 'Inactive 90+ days',
};

export const FLAG_HINT: Record<AccessFlag, string> = {
  owner_departed: 'The owner is offboarded but the account is still active',
  unmapped: 'No member owns this account. Map it or mark it a service account',
  admin: 'Privileged account. Confirm the access is still needed',
  no_mfa: 'MFA is off for this account',
  inactive: 'No sign-in for more than 90 days (PCI DSS 8.2.6)',
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

export const mfaLabel = (value: boolean | null) => (value === null ? '—' : value ? 'On' : 'Off');

export const ownerLabel = (account: Pick<AccessAccount, 'owner' | 'isServiceAccount'>) =>
  account.owner?.name ?? (account.isServiceAccount ? 'Service account' : 'Unmapped');
