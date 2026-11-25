import type { ActingUserResolver } from '../auth/acting-user.service';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import type { AuthenticatedRequest } from '../auth/types';
import { createManualDevice, updateManualDevice } from './manual-device';
import { ManualDevicesController } from './manual-devices.controller';

jest.mock('./manual-device', () => ({
  createManualDevice: jest.fn(),
  updateManualDevice: jest.fn(),
}));
jest.mock('@db', () => ({ db: {} }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: { member: ['update'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

const body = {
  memberId: 'mem_2',
  name: 'Linux box',
  platform: 'linux' as const,
  osVersion: 'Ubuntu 24.04',
  diskEncryptionEnabled: true,
  antivirusEnabled: true,
  passwordPolicySet: true,
  screenLockEnabled: true,
};

describe('ManualDevicesController', () => {
  const resolve = jest.fn();
  const controller = new ManualDevicesController({ resolve } as unknown as ActingUserResolver);
  const req = { userId: 'usr_admin' } as AuthenticatedRequest;
  beforeEach(() => {
    jest.clearAllMocks();
    resolve.mockResolvedValue({ userId: 'usr_admin', source: 'session' });
  });

  it.each(['createDevice', 'updateDevice'] as const)('%s requires member:update', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[method])).toEqual([
      { resource: 'member', actions: ['update'] },
    ]);
  });

  it('creates and updates in the caller organization, attested by the caller', async () => {
    await controller.createDevice('org_1', body, req);
    expect(resolve).toHaveBeenCalledWith(req, 'org_1');
    expect(createManualDevice).toHaveBeenCalledWith({ organizationId: 'org_1', dto: body, attestedById: 'usr_admin' });
    await controller.updateDevice('org_1', 'dev_1', body, req);
    expect(updateManualDevice).toHaveBeenCalledWith({
      organizationId: 'org_1',
      id: 'dev_1',
      dto: body,
      attestedById: 'usr_admin',
    });
  });

  it('records no attester when the call has no real acting user (owner fallback)', async () => {
    resolve.mockResolvedValue({ userId: 'usr_owner', source: 'org-owner-fallback' });
    const apiReq = { isApiKey: true } as AuthenticatedRequest;
    await controller.createDevice('org_1', body, apiReq);
    expect(createManualDevice).toHaveBeenCalledWith({ organizationId: 'org_1', dto: body, attestedById: null });
    await controller.updateDevice('org_1', 'dev_1', body, apiReq);
    expect(updateManualDevice).toHaveBeenCalledWith(expect.objectContaining({ attestedById: null }));
  });
});
