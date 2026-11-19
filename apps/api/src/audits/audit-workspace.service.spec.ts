const mockDb = {
  auditEngagement: { findFirst: jest.fn() },
  frameworkInstance: { findFirstOrThrow: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  auditRequirementReview: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  auditComment: { groupBy: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  auditEvidenceRequest: { groupBy: jest.fn() },
  requirementApplicability: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/company', () => ({ toExternalEvidenceFormType: () => null }));
jest.mock('../evidence-forms/evidence-forms.definitions', () => ({ evidenceFormDefinitions: {} }));
jest.mock('../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn().mockResolvedValue([
    { id: 'r1', identifier: 'A.5.1', name: 'Policies', description: '' },
    { id: 'r2', identifier: 'A.5.2', name: 'Roles', description: '' },
  ]),
}));
jest.mock('../tasks/evidence-export/framework-evidence-mappings', () => ({
  loadMappings: jest.fn().mockResolvedValue([
    {
      requirementId: 'r1',
      customRequirementId: null,
      control: { id: 'ctl_1', controlTemplateId: null, name: 'Policy set', policyIds: ['pol_1'], taskIds: ['tsk_1'], formTypes: [] },
    },
  ]),
}));
jest.mock('../tasks/evidence-export/native-artifact-control-map', () => ({
  registersForControlTemplates: () => [],
  registersForRequirement: () => [],
}));
jest.mock('./audit-evidence', () => ({
  loadAuditEvidence: jest.fn().mockResolvedValue({
    tasks: new Map([['tsk_1', { id: 'tsk_1', title: 'Review', status: 'done', filesInPeriod: 1, needsUpdate: false }]]),
    policies: new Map([['pol_1', { id: 'pol_1', name: 'ISP', status: 'published' }]]),
    submissions: new Map(),
  }),
}));

import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { AuditWorkspaceService } from './audit-workspace.service';

const auth = (roles: string[], memberId: string): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: roles,
  memberId,
});
const audit = {
  id: 'aud_1',
  frameworkInstanceId: 'frm_1',
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-12-31'),
  auditors: [{ memberId: 'mem_aud' }],
};

describe('AuditWorkspaceService', () => {
  const service = new AuditWorkspaceService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.auditEngagement.findFirst.mockResolvedValue(audit);
    mockDb.frameworkInstance.findFirstOrThrow.mockResolvedValue({ id: 'frm_1', frameworkId: 'fw' });
    mockDb.evidenceFormSetting.findMany.mockResolvedValue([]);
    mockDb.requirementApplicability.findMany.mockResolvedValue([{ requirementKey: 'r2' }]);
    mockDb.auditRequirementReview.findMany.mockResolvedValue([
      { requirementId: 'r1', status: 'accepted', note: null, reviewedAt: new Date(), reviewedBy: { user: { name: 'Ann', email: 'a@cb' } } },
    ]);
    mockDb.auditComment.groupBy.mockResolvedValue([{ requirementId: 'r1', _count: { _all: 2 } }]);
    mockDb.auditEvidenceRequest.groupBy.mockResolvedValue([]);
  });

  it('lists requirements with evidence, readiness and the assessment', async () => {
    const rows = await service.listRequirements({ auth: auth(['admin'], 'mem_admin'), auditId: 'aud_1' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'r1',
      readiness: 'ready',
      blockedBy: [],
      review: { status: 'accepted', reviewedBy: { name: 'Ann' } },
      commentCount: 2,
      tasks: [{ id: 'tsk_1' }],
      policies: [{ id: 'pol_1' }],
    });
    expect(rows[1]).toMatchObject({ id: 'r2', readiness: 'not_applicable', blockedBy: [], review: null });
    expect(mockDb.frameworkInstance.findFirstOrThrow.mock.calls[0][0].where).toEqual({
      id: 'frm_1',
      organizationId: 'org_1',
    });
  });

  it('lets an assigned auditor accept a requirement', async () => {
    await service.review({
      auth: auth(['auditor'], 'mem_aud'),
      auditId: 'aud_1',
      requirementId: 'r1',
      dto: { status: 'flagged', note: ' Missing Q2 ' },
    });
    const call = mockDb.auditRequirementReview.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ auditId_requirementId: { auditId: 'aud_1', requirementId: 'r1' } });
    expect(call.update).toMatchObject({ status: 'flagged', note: 'Missing Q2', reviewedById: 'mem_aud' });
  });

  it('does not let the team assess its own evidence', async () => {
    await expect(
      service.review({
        auth: auth(['owner'], 'mem_owner'),
        auditId: 'aud_1',
        requirementId: 'r1',
        dto: { status: 'accepted' },
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockDb.auditRequirementReview.upsert).not.toHaveBeenCalled();
  });

  it('rejects a requirement from another framework', async () => {
    await expect(
      service.review({
        auth: auth(['auditor'], 'mem_aud'),
        auditId: 'aud_1',
        requirementId: 'r_other',
        dto: { status: 'accepted' },
      }),
    ).rejects.toThrow('not part of this audit');
  });

  it('records comments from any member who can see the audit', async () => {
    mockDb.auditComment.create.mockResolvedValue({ id: 'acm_1' });
    await service.addComment({
      auth: auth(['admin'], 'mem_admin'),
      auditId: 'aud_1',
      dto: { requirementId: 'r1', content: ' Uploaded the Q2 review ' },
    });
    expect(mockDb.auditComment.create.mock.calls[0][0].data).toEqual({
      auditId: 'aud_1',
      requirementId: 'r1',
      authorId: 'mem_admin',
      content: 'Uploaded the Q2 review',
    });
  });
});
