import type { AccessAccount } from '@/hooks/use-access-reviews';
import { describe, expect, it } from 'vitest';
import { toAccountValues, toImportedAccount } from './AddAccountDialog';

const base = {
  accountId: '',
  name: '',
  email: '',
  roles: '',
  type: 'human' as const,
  mfa: 'unknown' as const,
  isAdmin: false,
};

describe('toImportedAccount', () => {
  it('uses the username as email when it is one, and splits roles', () => {
    expect(
      toImportedAccount({
        ...base,
        accountId: ' jane@acme.com ',
        roles: 'Approver; Reports, ',
        mfa: 'off',
        isAdmin: true,
      }),
    ).toEqual({
      accountId: 'jane@acme.com',
      name: undefined,
      email: 'jane@acme.com',
      type: 'human',
      roles: ['Approver', 'Reports'],
      isAdmin: true,
      mfaEnabled: false,
    });
  });

  it('leaves MFA unknown and email empty for a plain username', () => {
    const account = toImportedAccount({ ...base, accountId: 'svc-reports', type: 'service' });
    expect(account.email).toBeUndefined();
    expect(account.mfaEnabled).toBeUndefined();
    expect(account.roles).toEqual([]);
  });

  it('edits an account without wiping its status, last login or created date', () => {
    const existing: AccessAccount = {
      accountId: 'jane@acme.com',
      name: 'Jane',
      email: 'jane@acme.com',
      type: 'shared',
      status: 'suspended',
      roles: ['Approver', 'Reports'],
      isAdmin: true,
      mfaEnabled: null,
      lastLoginAt: '2026-11-01T00:00:00.000Z',
      accountCreatedAt: '2025-01-01T00:00:00.000Z',
      owner: null,
      ownerSource: null,
      isServiceAccount: false,
      justification: null,
      flags: [],
    };
    const values = toAccountValues(existing);
    expect(values).toEqual({
      accountId: 'jane@acme.com',
      name: 'Jane',
      email: 'jane@acme.com',
      roles: 'Approver, Reports',
      type: 'shared',
      mfa: 'unknown',
      isAdmin: true,
    });

    expect(toImportedAccount({ ...values, mfa: 'on' }, existing)).toEqual({
      accountId: 'jane@acme.com',
      name: 'Jane',
      email: 'jane@acme.com',
      type: 'shared',
      roles: ['Approver', 'Reports'],
      isAdmin: true,
      mfaEnabled: true,
      status: 'suspended',
      lastLoginAt: '2026-11-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });
});
