import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { BulkUpdateVendorsDto } from './dto/bulk-update-vendors.dto';
import { ListVendorsQueryDto } from './dto/list-vendors-query.dto';
import { VendorRegisterController } from './vendor-register.controller';
import { VendorRegisterService } from './vendor-register.service';

jest.mock('@db', () => ({ ...jest.requireActual('@prisma/client'), db: {} }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: { vendor: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('./vendor-register.service', () => ({
  VendorRegisterService: jest.fn(),
}));

const authContext: AuthContext = {
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  userEmail: 'a@x.com',
  memberId: 'mem_1',
};

describe('VendorRegisterController', () => {
  let controller: VendorRegisterController;
  const register = {
    bulkUpdate: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorRegisterController],
      providers: [{ provide: VendorRegisterService, useValue: register }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(VendorRegisterController);
  });

  it.each(['bulkUpdateVendors', 'archiveVendor', 'unarchiveVendor'] as const)(
    '%s requires vendor:update',
    (method) => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[method])).toEqual(
        [{ resource: 'vendor', actions: ['update'] }],
      );
    },
  );

  it('passes the organization and the acting user to the bulk update', async () => {
    register.bulkUpdate.mockResolvedValue({ updated: 1 });
    const result = await controller.bulkUpdateVendors(
      { updates: [{ id: 'vnd_1', criticality: 'low' }] },
      'org_1',
      authContext,
    );
    expect(register.bulkUpdate).toHaveBeenCalledWith({
      organizationId: 'org_1',
      updates: [{ id: 'vnd_1', criticality: 'low' }],
      actorUserId: 'usr_1',
    });
    expect(result).toMatchObject({ updated: 1, authType: 'session' });
  });

  it('archives with a reason', async () => {
    register.archive.mockResolvedValue({ id: 'vnd_1' });
    await controller.archiveVendor(
      'vnd_1',
      { reason: 'Ended' },
      'org_1',
      authContext,
    );
    expect(register.archive).toHaveBeenCalledWith({
      vendorId: 'vnd_1',
      organizationId: 'org_1',
      reason: 'Ended',
    });
  });

  it('validates bulk updates and list filters', async () => {
    const bad = plainToInstance(BulkUpdateVendorsDto, {
      updates: [{ id: 'vnd_1', criticality: 'extreme' }],
    });
    expect(await validate(bad)).not.toHaveLength(0);
    const empty = plainToInstance(BulkUpdateVendorsDto, { updates: [] });
    expect(await validate(empty)).not.toHaveLength(0);
    const query = plainToInstance(ListVendorsQueryDto, {
      criticality: 'unset',
      status: 'not_assessed',
      archived: 'true',
    });
    expect(await validate(query)).toHaveLength(0);
    expect(query.archived).toBe(true);
    const wrong = plainToInstance(ListVendorsQueryDto, { criticality: 'x' });
    expect(await validate(wrong)).not.toHaveLength(0);
  });
});
