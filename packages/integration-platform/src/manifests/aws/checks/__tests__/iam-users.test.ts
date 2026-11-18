import { describe, expect, it } from 'bun:test';
import { iamUserAccountEvidence } from '../iam-users';

const base = {
  awsAccountId: '123456789012',
  groups: ['Developers'],
  checkedAt: '2026-11-18T00:00:00.000Z',
};

describe('iamUserAccountEvidence', () => {
  it('marks console users as human with MFA status and admin via group policy', () => {
    const ev = iamUserAccountEvidence({
      ...base,
      user: {
        UserName: 'Jane@Acme.com',
        Arn: 'arn:aws:iam::123456789012:user/jane',
        CreateDate: new Date('2025-01-01T00:00:00Z'),
        PasswordLastUsed: new Date('2026-11-01T00:00:00Z'),
      },
      hasConsoleLogin: true,
      mfaDeviceCount: 0,
      policyArns: ['arn:aws:iam::aws:policy/AdministratorAccess'],
    });
    expect(ev).toMatchObject({
      accountName: 'Jane@Acme.com',
      email: 'jane@acme.com',
      type: 'human',
      isAdmin: true,
      mfa: false,
      roles: ['Developers'],
      policies: ['AdministratorAccess'],
      lastLoginAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('treats users without a console password as service accounts with unknown MFA', () => {
    const ev = iamUserAccountEvidence({
      ...base,
      user: { UserName: 'ci-deployer', Arn: 'arn:aws:iam::123456789012:user/ci-deployer' },
      hasConsoleLogin: false,
      mfaDeviceCount: 0,
      policyArns: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
    });
    expect(ev.type).toBe('service');
    expect(ev.isAdmin).toBe(false);
    expect('mfa' in ev).toBe(false);
    expect('email' in ev).toBe(false);
  });
});
