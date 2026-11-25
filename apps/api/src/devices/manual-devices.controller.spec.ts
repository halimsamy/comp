import { PERMISSIONS_KEY } from '../auth/permission.guard';
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
  const controller = new ManualDevicesController();
  beforeEach(() => jest.clearAllMocks());

  it.each(['createDevice', 'updateDevice'] as const)('%s requires member:update', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[method])).toEqual([
      { resource: 'member', actions: ['update'] },
    ]);
  });

  it('creates and updates in the caller organization', async () => {
    await controller.createDevice('org_1', body);
    expect(createManualDevice).toHaveBeenCalledWith({ organizationId: 'org_1', dto: body });
    await controller.updateDevice('org_1', 'dev_1', body);
    expect(updateManualDevice).toHaveBeenCalledWith({ organizationId: 'org_1', id: 'dev_1', dto: body });
  });
});
