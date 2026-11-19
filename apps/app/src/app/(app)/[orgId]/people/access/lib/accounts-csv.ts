import type { AccessAccount, ImportedAccount } from '@/hooks/use-access-reviews';
import { FLAG_LABEL, mfaLabel, ownerLabel } from './access-labels';

/** Split CSV text into rows of cells (RFC 4180 quotes, CRLF or LF). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

const COLUMNS: Record<string, keyof ImportedAccount> = {
  account: 'accountId',
  accountid: 'accountId',
  username: 'accountId',
  login: 'accountId',
  id: 'accountId',
  name: 'name',
  email: 'email',
  type: 'type',
  status: 'status',
  roles: 'roles',
  role: 'roles',
  groups: 'roles',
  admin: 'isAdmin',
  isadmin: 'isAdmin',
  mfa: 'mfaEnabled',
  lastlogin: 'lastLoginAt',
  lastloginat: 'lastLoginAt',
  created: 'createdAt',
  createdat: 'createdAt',
  owner: 'owner',
  owneremail: 'owner',
  justification: 'justification',
  purpose: 'justification',
};

const truthy = (value: string) => /^(yes|true|1|y|on|enabled)$/i.test(value.trim());

export interface AccountsCsvResult {
  accounts: ImportedAccount[];
  error: string | null;
}

/**
 * Map an exported account list to import rows. Needs an account column
 * (account, username, login or email); other columns are optional.
 */
export function parseAccountsCsv(text: string): AccountsCsvResult {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) return { accounts: [], error: 'The file is empty.' };
  const keys = header.map((h) => COLUMNS[h.toLowerCase().replace(/[^a-z]/g, '')]);
  const hasId = keys.includes('accountId') || keys.includes('email');
  if (!hasId) return { accounts: [], error: 'Add an "account" or "email" column.' };

  const accounts: ImportedAccount[] = [];
  for (const row of rows) {
    const account: ImportedAccount = { accountId: '' };
    keys.forEach((key, index) => {
      const value = row[index]?.trim() ?? '';
      if (!key || !value) return;
      if (key === 'roles') account.roles = value.split(/[;|]/).map((r) => r.trim()).filter(Boolean);
      else if (key === 'isAdmin') account.isAdmin = truthy(value);
      else if (key === 'mfaEnabled') account.mfaEnabled = truthy(value);
      else if (key === 'type')
        account.type = /shared|generic/i.test(value) ? 'shared' : /service|bot|system/i.test(value) ? 'service' : 'human';
      else if (key === 'status') {
        account.status = /suspend/i.test(value)
          ? 'suspended'
          : /deactiv|disabl|inactive/i.test(value)
            ? 'deactivated'
            : 'active';
      } else account[key] = value;
    });
    account.accountId = account.accountId || account.email || '';
    if (account.accountId) accounts.push(account);
  }
  if (accounts.length === 0) return { accounts, error: 'No account rows found.' };
  return { accounts, error: null };
}

export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const HEADER = ['System', 'Account', 'Email', 'Owner', 'Justification', 'Type', 'Status', 'Roles', 'Admin', 'MFA', 'Last login', 'Flags'];

function accountRow({ system, a }: { system: string; a: AccessAccount }) {
  return [
    system,
    a.name,
    a.email ?? '',
    ownerLabel(a),
    a.justification ?? '',
    a.isServiceAccount ? 'service' : (a.type ?? ''),
    a.status,
    a.roles.join('; '),
    a.isAdmin ? 'Yes' : 'No',
    mfaLabel(a.mfaEnabled),
    a.lastLoginAt ? a.lastLoginAt.slice(0, 10) : '',
    a.flags.map((f) => FLAG_LABEL[f] ?? f).join('; '),
  ];
}

const toCsv = (rows: string[][]) => [HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

/** The account inventory of one system as CSV (access provisioning evidence). */
export function buildAccountsCsv({ system, accounts }: { system: string; accounts: AccessAccount[] }) {
  return toCsv(accounts.map((a) => accountRow({ system, a })));
}

/** #97: every system's accounts in one file, or only the privileged ones. */
export function buildAllSystemsCsv(systems: { system: string; accounts: AccessAccount[] }[]) {
  return toCsv(systems.flatMap(({ system, accounts }) => accounts.map((a) => accountRow({ system, a }))));
}
