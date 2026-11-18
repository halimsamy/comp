const mockResolveRolePermissions = jest.fn();
jest.mock('../../auth/app-access', () => ({
  resolveRolePermissions: (...args: unknown[]) =>
    mockResolveRolePermissions(...args),
  permissionsGrant: (
    perms: Record<string, string[]>,
    resource: string,
    action: string,
  ) => perms[resource]?.includes(action) ?? false,
}));
jest.mock('../../auth/service-token.config', () => ({
  resolveServiceByName: (name?: string) =>
    name === 'svc' ? { permissions: ['vendor:read'] } : undefined,
}));
jest.mock('../../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));
jest.mock('@db', () => ({ db: {} }));

import type { AuthContext } from '../../auth/types';
import { resolveNativeAccess } from './native-access';

const base: AuthContext = {
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['custom'],
};

describe('resolveNativeAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gives an admin-like role every register and the SoA', async () => {
    mockResolveRolePermissions.mockResolvedValue({
      risk: ['read'],
      vendor: ['read'],
      member: ['read'],
      finding: ['read'],
      audit: ['read'],
    });

    await expect(resolveNativeAccess(base)).resolves.toEqual({
      registers: [
        'risks',
        'risk-acceptances',
        'vendors',
        'people',
        'devices',
        'offboarding',
        'findings',
      ],
      soa: true,
    });
    expect(mockResolveRolePermissions).toHaveBeenCalledWith('org_1', [
      'custom',
    ]);
  });

  it('leaves out what a read-limited role cannot see', async () => {
    mockResolveRolePermissions.mockResolvedValue({
      risk: ['read'],
      vendor: ['create'],
    });

    await expect(resolveNativeAccess(base)).resolves.toEqual({
      registers: ['risks', 'risk-acceptances'],
      soa: false,
    });
  });

  it('uses API key scopes, service permissions and platform-admin bypass', async () => {
    await expect(
      resolveNativeAccess({
        ...base,
        isApiKey: true,
        apiKeyScopes: ['finding:read'],
      }),
    ).resolves.toEqual({ registers: ['findings'], soa: false });
    await expect(
      resolveNativeAccess({
        ...base,
        isServiceToken: true,
        serviceName: 'svc',
      }),
    ).resolves.toEqual({ registers: ['vendors'], soa: false });
    await expect(
      resolveNativeAccess({ ...base, isPlatformAdmin: true }),
    ).resolves.toMatchObject({ soa: true });
    expect(mockResolveRolePermissions).not.toHaveBeenCalled();
  });
});
