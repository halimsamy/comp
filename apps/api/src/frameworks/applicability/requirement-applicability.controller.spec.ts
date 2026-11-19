import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../../auth/permission.guard';
import type { AuthContext } from '../../auth/types';
import { SetRequirementApplicabilityDto } from './dto/set-requirement-applicability.dto';
import { RequirementApplicabilityController } from './requirement-applicability.controller';
import { RequirementApplicabilityService } from './requirement-applicability.service';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { framework: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
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

describe('RequirementApplicabilityController', () => {
  let controller: RequirementApplicabilityController;
  const service = { list: jest.fn(), set: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequirementApplicabilityController],
      providers: [{ provide: RequirementApplicabilityService, useValue: service }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RequirementApplicabilityController);
  });

  it('gates reads with framework:read and writes with framework:update', () => {
    const proto = RequirementApplicabilityController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.list)).toEqual([
      { resource: 'framework', actions: ['read'] },
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.set)).toEqual([
      { resource: 'framework', actions: ['update'] },
    ]);
  });

  it('lists for the caller organization', async () => {
    await controller.list('org_1', 'fi_1');
    expect(service.list).toHaveBeenCalledWith({ organizationId: 'org_1', frameworkInstanceId: 'fi_1' });
  });

  it('records the acting member on writes', async () => {
    const dto = { status: 'not_applicable' as const, justification: 'No wireless' };
    await controller.set('org_1', authContext, 'fi_1', 'req_1', dto);
    expect(service.set).toHaveBeenCalledWith({
      organizationId: 'org_1',
      frameworkInstanceId: 'fi_1',
      requirementKey: 'req_1',
      memberId: 'mem_1',
      userId: 'usr_1',
      dto,
    });
  });

  it('rejects unknown statuses in the DTO', async () => {
    const bad = await validate(plainToInstance(SetRequirementApplicabilityDto, { status: 'maybe' }));
    const ok = await validate(
      plainToInstance(SetRequirementApplicabilityDto, { status: 'customized_approach', justification: 'x' }),
    );
    expect(bad).toHaveLength(1);
    expect(ok).toHaveLength(0);
  });
});
