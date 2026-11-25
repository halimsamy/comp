const mockRoles = jest.fn();
jest.mock('@db', () => ({
  db: { accessSystemRole: { findMany: (...a: unknown[]) => mockRoles(...a) } },
}));
jest.mock('./access-accounts.service', () => ({
  createAccessAccountsService: jest.fn(),
}));

import type { AccessAccountsService } from './access-accounts.service';
import { listPrivilegedAccounts } from './access-exports';

const account = (over: Record<string, unknown>) => ({
  accountId: 'x',
  name: 'X',
  email: null,
  roles: [],
  isAdmin: false,
  status: 'active',
  mfaEnabled: null,
  lastLoginAt: null,
  owner: null,
  isServiceAccount: false,
  flags: [],
  ...over,
});

describe('listPrivilegedAccounts', () => {
  it('includes admins and holders of a role marked privileged on that system', async () => {
    mockRoles.mockResolvedValue([
      { systemKey: 'manual:aws', name: 'Break-glass administrator' },
    ]);
    const accounts = {
      listAllAccounts: jest.fn().mockResolvedValue([
        {
          system: { key: 'manual:aws', name: 'AWS' },
          accounts: [
            account({ accountId: 'admin', isAdmin: true }),
            account({ accountId: 'spareadmin', roles: ['break-glass administrator '] }),
            account({ accountId: 'dev', roles: ['Software Engineer'] }),
            account({ accountId: 'gone', isAdmin: true, status: 'deactivated' }),
          ],
        },
        {
          // Same role name on another system is not privileged there.
          system: { key: 'manual:github', name: 'GitHub' },
          accounts: [account({ accountId: 'gh', roles: ['Break-glass administrator'] })],
        },
      ]),
    } as unknown as AccessAccountsService;

    const rows = await listPrivilegedAccounts('org_1', accounts);

    expect(mockRoles).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', isPrivileged: true },
      select: { systemKey: true, name: true },
    });
    expect(rows.map((r) => `${r.systemName}/${r.accountId}`)).toEqual([
      'AWS/admin',
      'AWS/spareadmin',
    ]);
  });
});
