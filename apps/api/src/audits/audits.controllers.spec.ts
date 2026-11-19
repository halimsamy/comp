import { Test, TestingModule } from '@nestjs/testing';
import type { AuthContext } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import { AuditRequestsController } from './audit-requests.controller';
import { AuditRequestsService } from './audit-requests.service';
import { AuditTeamRequestsService } from './audit-team-requests.service';
import { AuditWorkspaceController } from './audit-workspace.controller';
import { AuditWorkspaceService } from './audit-workspace.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { audit: ['create', 'read', 'update'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('../attachments/attachments.service', () => ({ AttachmentsService: class {} }));
jest.mock('../notifications/ownership-notifier.service', () => ({ OwnershipNotifier: class {} }));

const auth: AuthContext = {
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  memberId: 'mem_1',
};

describe('audit controllers', () => {
  let audits: AuditsController;
  let workspace: AuditWorkspaceController;
  let requests: AuditRequestsController;
  const auditsService = { list: jest.fn().mockResolvedValue([{ id: 'aud_1' }]), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const workspaceService = {
    listRequirements: jest.fn().mockResolvedValue([]),
    review: jest.fn(),
    clearReview: jest.fn(),
    listComments: jest.fn().mockResolvedValue([]),
    addComment: jest.fn(),
  };
  const requestsService = { list: jest.fn().mockResolvedValue([]), create: jest.fn(), respond: jest.fn(), decide: jest.fn(), uploadFile: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditsController, AuditWorkspaceController, AuditRequestsController],
      providers: [
        { provide: AuditsService, useValue: auditsService },
        { provide: AuditWorkspaceService, useValue: workspaceService },
        { provide: AuditRequestsService, useValue: requestsService },
        { provide: AuditTeamRequestsService, useValue: { create: jest.fn() } },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    audits = module.get(AuditsController);
    workspace = module.get(AuditWorkspaceController);
    requests = module.get(AuditRequestsController);
  });

  const permission = (handler: object) => Reflect.getMetadata(PERMISSIONS_KEY, handler);

  it.each([
    ['list', 'read'],
    ['get', 'read'],
    ['create', 'create'],
    ['update', 'update'],
    ['remove', 'update'],
  ] as const)('audits %s requires audit:%s', (method, action) => {
    expect(permission(audits[method])).toEqual([{ resource: 'audit', actions: [action] }]);
  });

  it.each([
    ['listRequirements', 'read'],
    ['review', 'read'],
    ['clearReview', 'read'],
    ['listComments', 'read'],
    ['addComment', 'read'],
  ] as const)('workspace %s requires audit:%s', (method, action) => {
    expect(permission(workspace[method])).toEqual([{ resource: 'audit', actions: [action] }]);
  });

  it.each([
    ['list', 'read'],
    ['create', 'read'],
    ['decide', 'read'],
    ['respond', 'update'],
    ['uploadFile', 'update'],
    ['createTeam', 'update'],
  ] as const)('requests %s requires audit:%s', (method, action) => {
    expect(permission(requests[method])).toEqual([{ resource: 'audit', actions: [action] }]);
  });

  it('wraps lists as { data, count }', async () => {
    await expect(audits.list(auth)).resolves.toEqual({ data: [{ id: 'aud_1' }], count: 1 });
    await workspace.listComments(auth, 'aud_1', 'r1');
    expect(workspaceService.listComments).toHaveBeenCalledWith({ auth, auditId: 'aud_1', requirementId: 'r1' });
  });

  it('uses the session user for uploads and requires userId for API keys', async () => {
    const dto = { fileName: 'a.pdf', fileType: 'application/pdf', fileData: 'YQ==' };
    await requests.uploadFile(auth, 'aud_1', 'aer_1', dto);
    expect(requestsService.uploadFile).toHaveBeenCalledWith({ auth, auditId: 'aud_1', requestId: 'aer_1', dto, userId: 'usr_1' });
    await expect(
      requests.uploadFile({ ...auth, isApiKey: true, userId: undefined }, 'aud_1', 'aer_1', dto),
    ).rejects.toThrow('User ID is required');
  });
});
