import { describe, expect, it } from 'vitest';
import type { AccessAccount } from '@/hooks/use-access-reviews';
import { buildAccountsCsv, parseAccountsCsv, parseCsvRows } from './accounts-csv';
import { filterByFlag } from './access-labels';

describe('parseCsvRows', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    expect(parseCsvRows('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseAccountsCsv', () => {
  it('maps common export columns to accounts', () => {
    const { accounts, error } = parseAccountsCsv(
      'Username,Email,Roles,Admin,MFA,Status,Last Login\njdoe,JDoe@acme.com,Refunds;Reports,yes,no,Disabled,2026-01-02\n,ops@acme.com,,,,,\n',
    );
    expect(error).toBeNull();
    expect(accounts).toEqual([
      {
        accountId: 'jdoe',
        email: 'JDoe@acme.com',
        roles: ['Refunds', 'Reports'],
        isAdmin: true,
        mfaEnabled: false,
        status: 'deactivated',
        lastLoginAt: '2026-01-02',
      },
      { accountId: 'ops@acme.com', email: 'ops@acme.com' },
    ]);
  });

  it('needs an account or email column', () => {
    expect(parseAccountsCsv('name,role\nJane,admin').error).toBe('Add an "account" or "email" column.');
  });
});

const account = (partial: Partial<AccessAccount>): AccessAccount => ({
  accountId: 'a',
  name: 'Jane',
  email: 'jane@acme.com',
  type: 'human',
  status: 'active',
  roles: ['admin'],
  isAdmin: true,
  mfaEnabled: false,
  lastLoginAt: '2026-11-01T00:00:00.000Z',
  accountCreatedAt: null,
  owner: null,
  ownerSource: null,
  isServiceAccount: false,
  justification: null,
  flags: ['unmapped', 'admin'],
  ...partial,
});

describe('buildAccountsCsv', () => {
  it('exports one row per account and neutralises formulas', () => {
    const csv = buildAccountsCsv({ system: 'GitHub', accounts: [account({ name: '=cmd()' })] });
    const [, row] = csv.split('\r\n');
    expect(row).toContain(`"'=cmd()"`);
    expect(row).toContain('"Unmapped"');
    expect(row).toContain('"No owner; Admin"');
  });
});

describe('filterByFlag', () => {
  it('filters flagged rows and single flags', () => {
    const rows = [account({}), account({ accountId: 'b', flags: [] })];
    expect(filterByFlag({ rows, filter: 'flagged' })).toHaveLength(1);
    expect(filterByFlag({ rows, filter: 'no_mfa' })).toHaveLength(0);
    expect(filterByFlag({ rows, filter: 'all' })).toHaveLength(2);
  });
});
