import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { SecuritySettingsController } from './security-settings.controller';
import { SecuritySettingsService } from './security-settings.service';

jest.mock('../auth/auth.server', () => ({ auth: { api: {} } }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('@trycompai/auth', () => ({
  statement: { organization: ['read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

describe('SecuritySettingsController', () => {
  const service = {
    get: jest.fn().mockResolvedValue({ sessionIdleTimeoutMinutes: 15 }),
    getSessionPolicy: jest.fn().mockResolvedValue({ sessionIdleTimeoutMinutes: 15 }),
    update: jest.fn().mockResolvedValue({ sessionIdleTimeoutMinutes: 30 }),
  };
  let controller: SecuritySettingsController;
  const authContext = {
    organizationId: 'org_1',
    authType: 'session' as const,
    isApiKey: false,
    isPlatformAdmin: false,
    userRoles: ['admin'],
    userId: 'usr_1',
    userEmail: 'a@b.com',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SecuritySettingsController],
      providers: [{ provide: SecuritySettingsService, useValue: service }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SecuritySettingsController);
  });

  it('requires organization:read to view, organization:update to change, app:read for the session policy', () => {
    const perms = (name: keyof SecuritySettingsController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, SecuritySettingsController.prototype[name]);
    expect(perms('getSecuritySettings')).toEqual([{ resource: 'organization', actions: ['read'] }]);
    expect(perms('updateSecuritySettings')).toEqual([{ resource: 'organization', actions: ['update'] }]);
    expect(perms('getSessionPolicy')).toEqual([{ resource: 'app', actions: ['read'] }]);
  });

  it('passes the org and caller session to the service', async () => {
    const res = await controller.updateSecuritySettings(
      { sessionIdleTimeoutMinutes: 30 },
      'org_1',
      authContext,
      { sessionId: 'ses_1' } as never,
    );
    expect(service.update).toHaveBeenCalledWith({
      organizationId: 'org_1',
      sessionId: 'ses_1',
      dto: { sessionIdleTimeoutMinutes: 30 },
    });
    expect(res).toMatchObject({ sessionIdleTimeoutMinutes: 30, authType: 'session' });
  });

  it('returns the session policy for the active org', async () => {
    const res = await controller.getSessionPolicy('org_1', authContext);
    expect(service.getSessionPolicy).toHaveBeenCalledWith('org_1');
    expect(res.sessionIdleTimeoutMinutes).toBe(15);
  });
});
