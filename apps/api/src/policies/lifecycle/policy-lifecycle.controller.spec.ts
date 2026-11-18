import { Test, type TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import type { AuthContext } from '../../auth/types';
import { PolicyAcknowledgementsController } from './policy-acknowledgements.controller';
import { PolicyAcknowledgementsService } from './policy-acknowledgements.service';
import { PolicyDocumentControlService } from './policy-document-control.service';
import { PolicyLifecycleController } from './policy-lifecycle.controller';
import { PolicyReviewsService } from './policy-reviews.service';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../../auth/auth.server', () => ({ auth: { api: {} } }));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@trycompai/email', () => ({}));
jest.mock('../../email/trigger-email', () => ({ triggerEmail: jest.fn() }));

describe('Policy lifecycle controllers', () => {
  let lifecycle: PolicyLifecycleController;
  let acknowledgements: PolicyAcknowledgementsController;
  const reviews = { list: jest.fn(), record: jest.fn() };
  const acks = {
    listForPolicy: jest.fn(),
    remindPending: jest.fn(),
    listForMember: jest.fn(),
    exportCsv: jest.fn(),
  };
  const documentControl = { get: jest.fn() };
  const auth: AuthContext = {
    organizationId: 'org_1',
    authType: 'session',
    isApiKey: false,
    isPlatformAdmin: false,
    userId: 'usr_1',
    memberId: 'mem_session',
    userRoles: ['admin'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PolicyLifecycleController, PolicyAcknowledgementsController],
      providers: [
        { provide: PolicyReviewsService, useValue: reviews },
        { provide: PolicyAcknowledgementsService, useValue: acks },
        { provide: PolicyDocumentControlService, useValue: documentControl },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    lifecycle = module.get(PolicyLifecycleController);
    acknowledgements = module.get(PolicyAcknowledgementsController);
  });

  it('records the review as the session member', async () => {
    await lifecycle.recordReview('pol_1', { notes: 'ok' }, 'org_1', auth);
    expect(reviews.record).toHaveBeenCalledWith({
      policyId: 'pol_1',
      organizationId: 'org_1',
      reviewerId: 'mem_session',
      notes: 'ok',
      nextReviewDate: undefined,
      requireReacknowledgement: undefined,
    });
  });

  it('wraps review lists in the list response shape', async () => {
    reviews.list.mockResolvedValue([{ id: 'prv_1' }]);
    expect(await lifecycle.listReviews('pol_1', 'org_1')).toEqual({
      data: [{ id: 'prv_1' }],
      count: 1,
    });
  });

  it('passes the org scope to acknowledgement endpoints', async () => {
    await lifecycle.listAcknowledgements('pol_1', 'org_1');
    await lifecycle.remindAcknowledgements('pol_1', 'org_1');
    await lifecycle.getDocumentControl('pol_1', 'org_1');
    await acknowledgements.exportCsv('org_1', '', 'mem_1');
    const scope = { policyId: 'pol_1', organizationId: 'org_1' };
    expect(acks.listForPolicy).toHaveBeenCalledWith(scope);
    expect(acks.remindPending).toHaveBeenCalledWith(scope);
    expect(documentControl.get).toHaveBeenCalledWith(scope);
    expect(acks.exportCsv).toHaveBeenCalledWith({
      organizationId: 'org_1',
      policyId: undefined,
      memberId: 'mem_1',
    });
  });

  it.each([
    ['listReviews', 'read'],
    ['recordReview', 'update'],
    ['listAcknowledgements', 'read'],
    ['remindAcknowledgements', 'update'],
    ['getDocumentControl', 'read'],
  ] as const)('%s requires policy:%s', (method, action) => {
    const handler = PolicyLifecycleController.prototype[method];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      { resource: 'policy', actions: [action] },
    ]);
  });

  it.each(['exportCsv', 'listForMember'] as const)(
    '%s requires policy:read',
    (method) => {
      const handler = PolicyAcknowledgementsController.prototype[method];
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        { resource: 'policy', actions: ['read'] },
      ]);
    },
  );
});
