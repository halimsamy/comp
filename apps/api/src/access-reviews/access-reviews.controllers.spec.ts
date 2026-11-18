import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import type { AuthContext } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import { AccessAccountsController } from './access-accounts.controller';
import { AccessAccountsService } from './access-accounts.service';
import { AccessReviewEvidenceService } from './access-review-evidence.service';
import { AccessReviewsController } from './access-reviews.controller';
import { AccessReviewsService } from './access-reviews.service';
import { AccessSystemsService } from './access-systems.service';

jest.mock('@db', () => ({ ...jest.requireActual('@prisma/client'), db: {} }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: { member: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@trycompai/integration-platform', () => ({
  TASK_TEMPLATES: {
    employeeAccess: 'frk_tt_ea',
    accessReviewLog: 'frk_tt_arl',
  },
}));

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

describe('access controllers', () => {
  let accountsController: AccessAccountsController;
  let reviewsController: AccessReviewsController;
  const accounts = { listSystems: jest.fn(), getSystemAccounts: jest.fn() };
  const systems = {
    create: jest.fn(),
    remove: jest.fn(),
    importAccounts: jest.fn(),
    setOwner: jest.fn(),
  };
  const reviews = {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    decide: jest.fn(),
    remediate: jest.fn(),
    signOff: jest.fn(),
    remove: jest.fn(),
  };
  const evidence = { report: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessAccountsController, AccessReviewsController],
      providers: [
        { provide: AccessAccountsService, useValue: accounts },
        { provide: AccessSystemsService, useValue: systems },
        { provide: AccessReviewsService, useValue: reviews },
        { provide: AccessReviewEvidenceService, useValue: evidence },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    accountsController = module.get(AccessAccountsController);
    reviewsController = module.get(AccessReviewsController);
  });

  it.each([
    ['listSystems', 'read'],
    ['listAccounts', 'read'],
    ['setOwner', 'update'],
    ['createSystem', 'update'],
    ['importAccounts', 'update'],
    ['deleteSystem', 'update'],
  ] as const)('accounts %s requires member:%s', (method, action) => {
    const metadata = Reflect.getMetadata(
      PERMISSIONS_KEY,
      accountsController[method],
    );
    expect(metadata).toEqual([{ resource: 'member', actions: [action] }]);
  });

  it.each([
    ['list', 'read'],
    ['get', 'read'],
    ['report', 'read'],
    ['create', 'update'],
    ['decide', 'update'],
    ['remediate', 'update'],
    ['signOff', 'update'],
    ['remove', 'update'],
  ] as const)('reviews %s requires member:%s', (method, action) => {
    const metadata = Reflect.getMetadata(
      PERMISSIONS_KEY,
      reviewsController[method],
    );
    expect(metadata).toEqual([{ resource: 'member', actions: [action] }]);
  });

  it('lists the accounts of the requested system', async () => {
    accounts.getSystemAccounts.mockResolvedValue({
      system: { key: 'compai' },
      accounts: [{}, {}],
    });
    const result = await accountsController.listAccounts(ORG, {
      system: 'compai',
    });
    expect(accounts.getSystemAccounts).toHaveBeenCalledWith({
      organizationId: ORG,
      systemKey: 'compai',
    });
    expect(result.count).toBe(2);
  });

  it('records the caller as the owner-mapping editor', async () => {
    const body = {
      systemKey: 'compai',
      accountId: 'a@x.com',
      memberId: 'mem_2',
    };
    await accountsController.setOwner(ORG, admin, body);
    expect(systems.setOwner).toHaveBeenCalledWith({
      organizationId: ORG,
      callerMemberId: 'mem_admin',
      ...body,
    });
  });

  it('passes the signed-in member and user to sign-off', async () => {
    await reviewsController.signOff(ORG, admin, 'arv_1', { note: 'ok' });
    expect(reviews.signOff).toHaveBeenCalledWith({
      organizationId: ORG,
      id: 'arv_1',
      callerMemberId: 'mem_admin',
      userId: 'usr_1',
      note: 'ok',
    });
  });

  it('sends the report as a PDF download', async () => {
    evidence.report.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      filename: 'access-review-q4.pdf',
    });
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await reviewsController.report(ORG, 'arv_1', res as unknown as Response);
    expect(evidence.report).toHaveBeenCalledWith({
      organizationId: ORG,
      id: 'arv_1',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });
});
