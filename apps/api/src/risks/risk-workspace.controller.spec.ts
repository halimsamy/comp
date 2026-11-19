import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { RiskWorkspaceController } from './risk-workspace.controller';
import { RiskWorkspaceService } from './risk-workspace.service';
import { RiskReviewsService } from './risk-reviews.service';
import { RiskSuggestionsService } from './risk-suggestions.service';

jest.mock('@db', () => ({ ...jest.requireActual('@prisma/client'), db: {} }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { risk: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn() }));
jest.mock('ai', () => ({ generateObject: jest.fn() }));

const ORG = 'org_1';
const admin: AuthContext = {
  organizationId: ORG,
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  userEmail: 'a@x.com',
  memberId: 'mem_admin',
};
const employee: AuthContext = { ...admin, userRoles: ['employee'], memberId: 'mem_emp' };

describe('RiskWorkspaceController', () => {
  let controller: RiskWorkspaceController;
  const workspace = {
    getLibrary: jest.fn(),
    bulkCreate: jest.fn(),
    listActions: jest.fn(),
    listLinkedTasks: jest.fn(),
  };
  const reviews = { list: jest.fn(), get: jest.fn(), create: jest.fn() };
  const suggestions = { suggest: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RiskWorkspaceController],
      providers: [
        { provide: RiskWorkspaceService, useValue: workspace },
        { provide: RiskReviewsService, useValue: reviews },
        { provide: RiskSuggestionsService, useValue: suggestions },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RiskWorkspaceController);
  });

  it.each([
    ['getSettings', 'read'],
    ['getLibrary', 'read'],
    ['bulkCreateRisks', 'create'],
    ['suggestRisks', 'create'],
    ['listActions', 'read'],
    ['listLinkedTasks', 'read'],
    ['listReviews', 'read'],
    ['getReview', 'read'],
    ['createReview', 'update'],
  ] as const)('%s requires risk:%s', (method, action) => {
    const metadata = Reflect.getMetadata(PERMISSIONS_KEY, controller[method]);
    expect(metadata).toEqual([{ resource: 'risk', actions: [action] }]);
  });

  it('scopes the action tracker to an employee’s own risks', async () => {
    workspace.listActions.mockResolvedValue([]);
    await controller.listActions({}, ORG, employee);
    expect(workspace.listActions).toHaveBeenCalledWith({
      organizationId: ORG,
      query: {},
      assignmentFilter: { assigneeId: 'mem_emp' },
    });
  });

  it('gives admins the whole register in the action tracker', async () => {
    workspace.listActions.mockResolvedValue([]);
    await controller.listActions({ overdue: true }, ORG, admin);
    expect(workspace.listActions).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentFilter: {}, query: { overdue: true } }),
    );
  });

  it('records a review signed by the caller', async () => {
    reviews.create.mockResolvedValue({ id: 'rskrv_1' });
    await controller.createReview({ notes: 'ok' }, ORG, admin);
    expect(reviews.create).toHaveBeenCalledWith({
      organizationId: ORG,
      callerMemberId: 'mem_admin',
      dto: { notes: 'ok' },
    });
  });

  it('blocks register-wide reviews for roles limited to their own risks', async () => {
    await expect(controller.listReviews(ORG, employee)).rejects.toThrow(ForbiddenException);
    await expect(controller.getReview('rskrv_1', ORG, employee)).rejects.toThrow(ForbiddenException);
    await expect(controller.createReview({}, ORG, employee)).rejects.toThrow(ForbiddenException);
    expect(reviews.list).not.toHaveBeenCalled();
    expect(reviews.create).not.toHaveBeenCalled();
  });

  it('passes bulk risks through to the service', async () => {
    const risks = [
      { title: 'A', description: 'd', category: 'technology', likelihood: 'possible', impact: 'major' },
    ] as const;
    workspace.bulkCreate.mockResolvedValue({ created: [], skipped: [] });
    await controller.bulkCreateRisks({ risks: [...risks] }, ORG, admin);
    expect(workspace.bulkCreate).toHaveBeenCalledWith({
      organizationId: ORG,
      risks: [...risks],
      ownerMemberId: 'mem_admin',
    });
  });

  it('scopes linked controls to an employee’s own risks', async () => {
    workspace.listLinkedTasks.mockResolvedValue([]);
    await controller.listLinkedTasks(ORG, employee);
    expect(workspace.listLinkedTasks).toHaveBeenCalledWith({
      organizationId: ORG,
      assignmentFilter: { assigneeId: 'mem_emp' },
    });
  });
});
