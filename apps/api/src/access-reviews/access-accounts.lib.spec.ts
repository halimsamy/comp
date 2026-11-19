import { accountFlags, type BaseAccount, type SystemPolicy } from './access-accounts.lib';

const now = new Date('2026-11-19T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const owner = { memberId: 'mem_1', name: 'Jane', email: 'jane@acme.com', departed: false };
const base: BaseAccount = {
  accountId: 'a',
  name: 'a',
  email: null,
  type: null,
  status: 'active',
  roles: [],
  isAdmin: false,
  mfaEnabled: true,
  lastLoginAt: daysAgo(1),
  accountCreatedAt: daysAgo(400),
};
const flags = (
  account: Partial<BaseAccount>,
  extra: { owner?: typeof owner | null; isServiceAccount?: boolean; justification?: string; policy?: SystemPolicy } = {},
) =>
  accountFlags({
    account: { ...base, ...account },
    owner: extra.owner === undefined ? owner : extra.owner,
    isServiceAccount: extra.isServiceAccount ?? false,
    justification: extra.justification,
    policy: extra.policy,
    now,
  });

describe('accountFlags', () => {
  it('flags a service account without a justification as unmapped (#89)', () => {
    expect(flags({}, { owner: null, isServiceAccount: true })).toContain('unmapped');
    expect(flags({}, { owner: null, isServiceAccount: true, justification: 'Batch job' })).not.toContain('unmapped');
  });

  it('separates inactive (no login for 90 days) from no_activity (never logged in)', () => {
    expect(flags({ lastLoginAt: daysAgo(120) })).toEqual(['inactive']);
    expect(flags({ lastLoginAt: null, accountCreatedAt: daysAgo(120) })).toEqual(['no_activity']);
    expect(flags({ lastLoginAt: null, accountCreatedAt: daysAgo(10) })).toEqual([]);
  });

  it('flags roles outside the approved catalog, and admins without a privileged role (#159)', () => {
    const policy: SystemPolicy = {
      approvedRoles: [
        { name: 'Viewer', isPrivileged: false },
        { name: 'Admin', isPrivileged: true },
      ],
      allowedTypes: {},
    };
    expect(flags({ roles: ['viewer'] }, { policy })).toEqual([]);
    expect(flags({ roles: ['Billing'] }, { policy })).toContain('role_not_approved');
    expect(flags({ roles: ['Viewer'], isAdmin: true }, { policy })).toEqual(['admin', 'admin_role_unapproved']);
    expect(flags({ roles: ['Admin'], isAdmin: true }, { policy })).toEqual(['admin']);
  });

  it('does not flag roles while a system has no role catalog', () => {
    expect(flags({ roles: ['Anything'] }, { policy: { approvedRoles: [], allowedTypes: {} } })).toEqual([]);
  });

  it('flags account types the system does not allow (#177)', () => {
    const policy: SystemPolicy = { approvedRoles: [], allowedTypes: { shared: { allowed: false } } };
    expect(flags({ type: 'shared' }, { policy })).toContain('type_not_allowed');
    expect(flags({ type: null }, { policy })).not.toContain('type_not_allowed');
  });

  it('only flags activity problems on active accounts', () => {
    expect(flags({ status: 'suspended', lastLoginAt: daysAgo(300), mfaEnabled: false }, { owner: null })).toEqual([]);
  });
});
