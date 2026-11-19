import { BadRequestException } from '@nestjs/common';

const mockDb = {
  organization: { findUnique: jest.fn() },
  frameworkInstance: { findMany: jest.fn() },
  ismsProfile: { findFirst: jest.fn() },
  integrationConnection: { findMany: jest.fn() },
  integration: { count: jest.fn() },
  device: { count: jest.fn() },
  policy: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  invitation: { count: jest.fn() },
  ismsDocument: { findMany: jest.fn() },
  sOADocument: { findFirst: jest.fn() },
  task: { findFirst: jest.fn(), groupBy: jest.fn() },
  risk: { findMany: jest.fn() },
  riskAcceptance: { findMany: jest.fn() },
  vendor: { findMany: jest.fn() },
  evidenceSubmission: { count: jest.fn() },
  onboarding: { findUnique: jest.fn(), upsert: jest.fn() },
  control: { findMany: jest.fn() },
  asset: { findMany: jest.fn() },
  auditEngagement: { count: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { loadChecklistState } from './load-checklist-state';
import { OnboardingChecklistController } from './onboarding-checklist.controller';
import { OnboardingChecklistService } from './onboarding-checklist.service';

function seedDb() {
  mockDb.organization.findUnique.mockResolvedValue({
    logo: 'org_1/logo.png',
    website: null,
    fleetDmLabelId: null,
    sessionIdleTimeoutMinutes: 15,
  });
  mockDb.control.findMany.mockResolvedValue([
    { ownerId: 'mem_1' },
    { ownerId: null },
  ]);
  mockDb.asset.findMany.mockResolvedValue([
    { cdeScope: 'in_scope' },
    { cdeScope: 'unassessed' },
  ]);
  mockDb.auditEngagement.count.mockResolvedValue(0);
  mockDb.frameworkInstance.findMany.mockResolvedValue([
    { framework: { name: 'ISO 27001' }, customFramework: null },
    { framework: { name: 'PCI DSS Level 1' }, customFramework: null },
  ]);
  mockDb.ismsProfile.findFirst.mockResolvedValue({ id: 'isms_pf_1' });
  mockDb.integrationConnection.findMany.mockResolvedValue([
    { provider: { category: 'Cloud' } },
  ]);
  mockDb.integration.count.mockResolvedValue(0);
  mockDb.device.count.mockResolvedValue(0);
  mockDb.policy.findMany.mockResolvedValue([
    {
      id: 'pol_a',
      status: 'published',
      isRequiredToSign: true,
      visibility: 'ALL',
      signedBy: ['mem_1'],
    },
    {
      id: 'pol_b',
      status: 'draft',
      isRequiredToSign: true,
      visibility: 'ALL',
      signedBy: [],
    },
  ]);
  mockDb.member.findMany.mockResolvedValue([
    { id: 'mem_1', role: 'owner,employee' },
    { id: 'mem_2', role: 'employee' },
    { id: 'mem_3', role: 'auditor' },
  ]);
  mockDb.invitation.count.mockResolvedValue(0);
  mockDb.ismsDocument.findMany.mockResolvedValue([
    { currentVersionId: 'v1' },
    { currentVersionId: null },
  ]);
  mockDb.sOADocument.findFirst.mockResolvedValue(null);
  mockDb.task.findFirst.mockResolvedValue({
    id: 'tsk_scope',
    status: 'in_review',
  });
  mockDb.risk.findMany.mockResolvedValue([
    { id: 'rsk_1', status: 'open' },
    { id: 'rsk_2', status: 'pending' },
  ]);
  mockDb.riskAcceptance.findMany.mockResolvedValue([{ riskId: 'rsk_2' }]);
  mockDb.vendor.findMany.mockResolvedValue([
    { status: 'assessed', criticality: 'high' },
    { status: 'not_assessed', criticality: null },
  ]);
  mockDb.task.groupBy.mockResolvedValue([
    { status: 'done', _count: { _all: 3 } },
    { status: 'not_relevant', _count: { _all: 1 } },
    { status: 'todo', _count: { _all: 6 } },
  ]);
  mockDb.evidenceSubmission.count.mockResolvedValue(2);
  mockDb.onboarding.findUnique.mockResolvedValue({
    checklistSkips: { bogus: 1 },
  });
}

describe('loadChecklistState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedDb();
  });

  it('computes the guide inputs from org-scoped queries', async () => {
    const state = await loadChecklistState('org_1');

    expect(state).toMatchObject({
      hasIso27001: true,
      hasPciDss: true,
      hasLogo: true,
      hasWebsite: false,
      connectedCategories: ['Cloud'],
      policies: { total: 2, published: 1, firstUnpublishedId: 'pol_b' },
      acknowledgements: { members: 2, fullySigned: 1 },
      ismsDocuments: { total: 2, approved: 1 },
      pciScopeTask: { id: 'tsk_scope', done: false },
      risks: { total: 2, assessed: 1, withAcceptance: 1 },
      vendors: { total: 2, assessed: 1, classified: 1 },
      // Not relevant tasks are out of the denominator (#125).
      tasks: { total: 9, complete: 3, notRelevant: 1 },
      idleTimeoutMinutes: 15,
      controls: { total: 2, owned: 1 },
      assets: { total: 2, scoped: 1 },
      auditorInvited: true,
      skips: {},
    });
    // Archived tasks never count, in progress or for the PCI scope step.
    expect(mockDb.task.groupBy.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      archivedAt: null,
    });
    expect(mockDb.task.findFirst.mock.calls[0][0].where.archivedAt).toBeNull();
    for (const call of [
      mockDb.policy.findMany,
      mockDb.member.findMany,
      mockDb.task.groupBy,
      mockDb.vendor.findMany,
      mockDb.control.findMany,
      mockDb.asset.findMany,
      mockDb.auditEngagement.count,
    ]) {
      expect(call.mock.calls[0][0].where.organizationId).toBe('org_1');
    }
  });
});

describe('loadChecklistState auditor step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedDb();
  });

  it('is done when an audit engagement has an auditor, even without an auditor member', async () => {
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_1', role: 'owner' }]);
    expect((await loadChecklistState('org_1')).auditorInvited).toBe(false);
    mockDb.auditEngagement.count.mockResolvedValue(1);
    expect((await loadChecklistState('org_1')).auditorInvited).toBe(true);
  });
});

describe('OnboardingChecklistService', () => {
  const service = new OnboardingChecklistService();
  beforeEach(() => {
    jest.clearAllMocks();
    seedDb();
  });

  it('stores a skip with its reason and returns the updated checklist', async () => {
    mockDb.onboarding.findUnique.mockResolvedValueOnce({ checklistSkips: {} });

    await service.skipItem({
      organizationId: 'org_1',
      itemId: 'version_control',
      reason: ' No code ',
      skippedById: 'usr_1',
    });

    const upsert = mockDb.onboarding.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ organizationId: 'org_1' });
    expect(upsert.update.checklistSkips.version_control).toMatchObject({
      reason: 'No code',
      skippedById: 'usr_1',
    });
  });

  it('removes a skip', async () => {
    mockDb.onboarding.findUnique.mockResolvedValueOnce({
      checklistSkips: {
        version_control: {
          reason: 'x',
          skippedAt: '2026-01-01',
          skippedById: null,
        },
      },
    });
    await service.unskipItem({
      organizationId: 'org_1',
      itemId: 'version_control',
    });
    expect(
      mockDb.onboarding.upsert.mock.calls[0][0].update.checklistSkips,
    ).toEqual({});
  });

  it('rejects unknown item ids', async () => {
    await expect(
      service.skipItem({
        organizationId: 'org_1',
        itemId: 'nope',
        reason: 'x',
        skippedById: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.onboarding.upsert).not.toHaveBeenCalled();
  });

  it('refuses to skip steps the audit needs (SoA, ISMS documents, PCI scope)', async () => {
    await expect(
      service.skipItem({
        organizationId: 'org_1',
        itemId: 'statement_of_applicability',
        reason: 'later',
        skippedById: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.onboarding.upsert).not.toHaveBeenCalled();
  });
});

describe('OnboardingChecklistController', () => {
  const service = {
    getChecklist: jest.fn().mockResolvedValue({ total: 1 }),
    skipItem: jest.fn().mockResolvedValue({}),
    unskipItem: jest.fn().mockResolvedValue({}),
  };
  const controller = new OnboardingChecklistController(
    service as unknown as OnboardingChecklistService,
  );

  const sessionContext: AuthContext = {
    organizationId: 'org_1',
    authType: 'session',
    isApiKey: false,
    isPlatformAdmin: false,
    userId: 'usr_1',
    userRoles: ['owner'],
  };

  it('passes the organization and actor to the service', async () => {
    await controller.getChecklist('org_1');
    await controller.skipItem('org_1', sessionContext, 'cloud_provider', {
      reason: 'On-prem only',
    });
    await controller.unskipItem('org_1', 'cloud_provider');

    expect(service.getChecklist).toHaveBeenCalledWith('org_1');
    expect(service.skipItem).toHaveBeenCalledWith({
      organizationId: 'org_1',
      itemId: 'cloud_provider',
      reason: 'On-prem only',
      skippedById: 'usr_1',
    });
    expect(service.unskipItem).toHaveBeenCalledWith({
      organizationId: 'org_1',
      itemId: 'cloud_provider',
    });
  });

  it('requires app:read to view and organization:update to skip', () => {
    const proto = OnboardingChecklistController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.getChecklist)).toEqual([
      { resource: 'app', actions: ['read'] },
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.skipItem)).toEqual([
      { resource: 'organization', actions: ['update'] },
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.unskipItem)).toEqual([
      { resource: 'organization', actions: ['update'] },
    ]);
  });
});
