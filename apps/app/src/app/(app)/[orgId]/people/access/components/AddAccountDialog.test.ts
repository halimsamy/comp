import { describe, expect, it } from 'vitest';
import { toImportedAccount } from './AddAccountDialog';

const base = { accountId: '', name: '', email: '', roles: '', type: 'human' as const, mfa: 'unknown' as const, isAdmin: false };

describe('toImportedAccount', () => {
  it('uses the username as email when it is one, and splits roles', () => {
    expect(toImportedAccount({ ...base, accountId: ' jane@acme.com ', roles: 'Approver; Reports, ', mfa: 'off', isAdmin: true })).toEqual({
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
});
