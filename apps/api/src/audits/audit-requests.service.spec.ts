const mockDb = {
  auditEngagement: { findFirst: jest.fn() },
  auditEvidenceRequest: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditRequirementReview: { upsert: jest.fn() },
  attachment: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../attachments/attachments.service', () => ({ AttachmentsService: class {} }));
jest.mock('./audit-workspace.service', () => ({ AuditWorkspaceService: class {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { AuditRequestsService } from './audit-requests.service';

const auth = (roles: string[], memberId: string): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: roles,
  memberId,
});
const auditor = auth(['auditor'], 'mem_aud');
const owner = auth(['owner'], 'mem_owner');

describe('AuditRequestsService', () => {
  const attachments = { uploadAttachment: jest.fn() };
  const workspace = { assertRequirement: jest.fn() };
  const service = new AuditRequestsService(attachments as never, workspace as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.auditEngagement.findFirst.mockResolvedValue({
      id: 'aud_1',
      frameworkInstanceId: 'frm_1',
      auditors: [{ memberId: 'mem_aud' }],
    });
    mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
    mockDb.auditEvidenceRequest.findFirst.mockResolvedValue({ id: 'aer_1', status: 'open' });
  });

  it('lets an assigned auditor request evidence and marks the requirement requested', async () => {
    mockDb.auditEvidenceRequest.create.mockResolvedValue({ id: 'aer_1' });
    await service.create({
      auth: auditor,
      auditId: 'aud_1',
      dto: { title: 'New hires 2026', requirementId: 'r1', dueDate: '2026-12-15' },
    });
    expect(workspace.assertRequirement).toHaveBeenCalled();
    expect(mockDb.auditEvidenceRequest.create.mock.calls[0][0].data).toMatchObject({
      auditId: 'aud_1',
      requirementId: 'r1',
      requestedById: 'mem_aud',
    });
    expect(mockDb.auditRequirementReview.upsert.mock.calls[0][0].update.status).toBe('requested');
  });

  it('does not let the team raise requests', async () => {
    await expect(
      service.create({ auth: owner, auditId: 'aud_1', dto: { title: 'x' } }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records the team response as submitted', async () => {
    await service.respond({ auth: owner, auditId: 'aud_1', requestId: 'aer_1', dto: { response: ' See file ' } });
    expect(mockDb.auditEvidenceRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: 'aer_1',
      auditId: 'aud_1',
    });
    expect(mockDb.auditEvidenceRequest.update.mock.calls[0][0].data).toMatchObject({
      response: 'See file',
      status: 'submitted',
    });
  });

  it('keeps auditors from responding to their own requests', async () => {
    await expect(
      service.respond({ auth: auditor, auditId: 'aud_1', requestId: 'aer_1', dto: { response: 'x' } }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('uploads response files as audit_request attachments', async () => {
    const dto = { fileName: 'hires.csv', fileType: 'text/csv', fileData: 'YQ==' };
    await service.uploadFile({ auth: owner, auditId: 'aud_1', requestId: 'aer_1', dto, userId: 'usr_1' });
    expect(attachments.uploadAttachment).toHaveBeenCalledWith('org_1', 'aer_1', 'audit_request', dto, 'usr_1');
  });

  it('refuses files on an accepted request', async () => {
    mockDb.auditEvidenceRequest.findFirst.mockResolvedValue({ id: 'aer_1', status: 'accepted' });
    await expect(
      service.uploadFile({
        auth: owner,
        auditId: 'aud_1',
        requestId: 'aer_1',
        dto: { fileName: 'a.pdf', fileType: 'application/pdf' },
        userId: 'usr_1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets the auditor accept a response', async () => {
    await service.decide({ auth: auditor, auditId: 'aud_1', requestId: 'aer_1', dto: { status: 'accepted' } });
    expect(mockDb.auditEvidenceRequest.update.mock.calls[0][0].data).toEqual({ status: 'accepted' });
  });

  it('lists requests with their files, scoped to the org', async () => {
    mockDb.auditEvidenceRequest.findMany.mockResolvedValue([
      { id: 'aer_1', title: 'x', status: 'open', requestedBy: { user: { name: 'Ann', email: 'a@cb' } } },
    ]);
    mockDb.attachment.findMany.mockResolvedValue([
      { id: 'att_1', name: 'a.pdf', entityId: 'aer_1', createdAt: new Date() },
    ]);
    const [request] = await service.list({ auth: owner, auditId: 'aud_1' });
    expect(mockDb.attachment.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      entityType: 'audit_request',
    });
    expect(request.requestedBy).toEqual({ name: 'Ann', email: 'a@cb' });
    expect(request.attachments).toHaveLength(1);
  });
});
