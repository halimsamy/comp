import { NotFoundException } from '@nestjs/common';

const mockDb = {
  task: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  member: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
const mockPickApprover = jest.fn();
jest.mock('./native-evidence-approver', () => ({ pickNativeApprover: (...a: unknown[]) => mockPickApprover(...a) }));
jest.mock('../task-notifier.service', () => ({ TaskNotifierService: class {} }));
jest.mock('../../attachments/attachments.service', () => ({ AttachmentsService: class {} }));
jest.mock('../../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('./native-evidence-pdf', () => ({
  renderNativeEvidencePdf: () => ({ buffer: Buffer.from('pdf'), filename: 'x.pdf' }),
}));

const evaluate = jest.fn();
jest.mock('./native-evidence-rules', () => ({
  NATIVE_EVIDENCE_RULES: { tpl_rtp: {} },
  ruleForTemplate: (id: string | null) =>
    id === 'tpl_rtp'
      ? { key: 'isms_risk_treatment_plan', module: 'ISMS', title: 'RTP', reference: '6.1.3', path: '/x', evaluate }
      : null,
}));

import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import { NativeEvidenceController } from './native-evidence.controller';
import { alreadySubmitted, NativeEvidenceService } from './native-evidence.service';
import type { AttachmentsService } from '../../attachments/attachments.service';
import type { TaskNotifierService } from '../task-notifier.service';

const NOW = new Date('2026-11-18T00:00:00Z');
const HOLDS = { holds: true, summary: 'v2 published', issues: [], fingerprint: 'fp1', sections: [] };

function openTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tsk_1',
    title: 'Risk Analysis',
    status: 'todo',
    frequency: 'yearly',
    taskTemplateId: 'tpl_rtp',
    lastCompletedAt: null,
    approverId: null,
    nativeEvidenceFingerprint: null,
    nativeEvidenceSubmittedAt: null,
    nativeEvidenceAttachmentId: null,
    ...overrides,
  };
}

describe('NativeEvidenceService', () => {
  const uploadAttachment = jest.fn().mockResolvedValue({ id: 'att_1' });
  const notifyEvidenceReviewRequested = jest.fn().mockResolvedValue(undefined);
  const service = new NativeEvidenceService(
    { uploadAttachment } as unknown as AttachmentsService,
    { notifyEvidenceReviewRequested } as unknown as TaskNotifierService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme', primaryColor: null });
    evaluate.mockResolvedValue(HOLDS);
    mockDb.task.updateMany.mockResolvedValue({ count: 1 });
  });

  it('routes the review to an approver and notifies them when approval is on (#42)', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme', primaryColor: null, evidenceApprovalEnabled: true });
    mockDb.task.findFirst.mockResolvedValue(openTask({ approverId: 'mem_last' }));
    mockPickApprover.mockResolvedValue('mem_last');
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_me', user: { name: 'Ann', email: 'a@x.io' } });
    await service.submit({ organizationId: 'org_1', taskId: 'tsk_1', userId: 'usr_1', now: NOW });

    expect(mockPickApprover).toHaveBeenCalledWith({ organizationId: 'org_1', taskId: 'tsk_1', lastApproverId: 'mem_last' });
    expect(mockDb.task.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'in_review', approverId: 'mem_last' });
    expect(mockDb.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId: 'org_1',
      description: 'sent auto-evidence from ISMS for review',
      data: expect.objectContaining({ source: 'auto_evidence' }),
    });
    expect(notifyEvidenceReviewRequested).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', taskId: 'tsk_1', approverMemberId: 'mem_last' }),
    );
  });

  it('leaves the approver unset when evidence approval is off', async () => {
    mockDb.task.findFirst.mockResolvedValue(openTask());
    await service.submit({ organizationId: 'org_1', taskId: 'tsk_1', now: NOW });
    expect(mockPickApprover).not.toHaveBeenCalled();
    expect(mockDb.task.updateMany.mock.calls[0][0].data.approverId).toBeUndefined();
    expect(notifyEvidenceReviewRequested).not.toHaveBeenCalled();
  });

  it('scopes the task lookup to the organization', async () => {
    mockDb.task.findFirst.mockResolvedValue(null);
    await expect(service.getStatus({ organizationId: 'org_2', taskId: 'tsk_1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockDb.task.findFirst.mock.calls[0][0].where).toEqual({
      id: 'tsk_1',
      organizationId: 'org_2',
      archivedAt: null,
    });
  });

  it('returns null status for tasks without a rule', async () => {
    mockDb.task.findFirst.mockResolvedValue(openTask({ taskTemplateId: 'other' }));
    expect(await service.getStatus({ organizationId: 'org_1', taskId: 'tsk_1' })).toEqual({ data: null });
  });

  it('reports live status and whether it can be submitted', async () => {
    mockDb.task.findFirst.mockResolvedValue(openTask({ status: 'done' }));
    const { data } = await service.getStatus({ organizationId: 'org_1', taskId: 'tsk_1', now: NOW });
    expect(data).toMatchObject({ module: 'ISMS', holds: true, summary: 'v2 published', canSubmit: false });
    expect(evaluate).toHaveBeenCalledWith({ organizationId: 'org_1', now: NOW, frequency: 'yearly' });
  });

  it('attaches the snapshot and moves the task to in_review, never done', async () => {
    mockDb.task.findFirst.mockResolvedValue(openTask());
    const result = await service.submit({ organizationId: 'org_1', taskId: 'tsk_1', now: NOW });

    expect(result).toEqual({ outcome: 'submitted', attachmentId: 'att_1' });
    expect(uploadAttachment).toHaveBeenCalledWith(
      'org_1',
      'tsk_1',
      'task',
      expect.objectContaining({ fileType: 'application/pdf' }),
      undefined,
    );
    expect(mockDb.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'tsk_1', organizationId: 'org_1', status: { in: ['todo', 'in_progress', 'failed'] } },
      data: expect.objectContaining({
        status: 'in_review',
        nativeEvidenceFingerprint: 'fp1',
        nativeEvidenceSubmittedAt: NOW,
        nativeEvidenceAttachmentId: 'att_1',
      }),
    });
  });

  it.each(['done', 'in_review', 'not_relevant'])('leaves %s tasks alone', async (status) => {
    mockDb.task.findFirst.mockResolvedValue(openTask({ status }));
    expect(await service.submit({ organizationId: 'org_1', taskId: 'tsk_1' })).toEqual({ outcome: 'not_open' });
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('does nothing when the rule does not hold', async () => {
    mockDb.task.findFirst.mockResolvedValue(openTask());
    evaluate.mockResolvedValue({ ...HOLDS, holds: false });
    expect(await service.submit({ organizationId: 'org_1', taskId: 'tsk_1' })).toEqual({ outcome: 'not_met' });
    expect(mockDb.task.updateMany).not.toHaveBeenCalled();
  });

  it('does not resend unchanged evidence after a rejection, unless forced', async () => {
    mockDb.task.findFirst.mockResolvedValue(
      openTask({ nativeEvidenceFingerprint: 'fp1', nativeEvidenceSubmittedAt: NOW }),
    );
    expect(await service.submit({ organizationId: 'org_1', taskId: 'tsk_1' })).toEqual({ outcome: 'unchanged' });
    expect((await service.submit({ organizationId: 'org_1', taskId: 'tsk_1', force: true })).outcome).toBe(
      'submitted',
    );
  });

  it('keeps going when one task fails in the scheduled pass', async () => {
    mockDb.task.findMany.mockResolvedValue([
      { id: 'tsk_1', organizationId: 'org_1' },
      { id: 'tsk_2', organizationId: 'org_2' },
    ]);
    mockDb.task.findFirst.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(openTask());
    const result = await service.evaluateAll(NOW);
    expect(result).toMatchObject({ checked: 2, error: 1, submitted: 1 });
    expect(mockDb.task.findMany.mock.calls[0][0].where).toMatchObject({
      taskTemplateId: { in: ['tpl_rtp'] },
      archivedAt: null,
    });
  });
});

describe('alreadySubmitted', () => {
  const at = new Date('2026-01-01');
  it('is false once the task was completed after the last submission', () => {
    expect(
      alreadySubmitted({
        task: { nativeEvidenceFingerprint: 'fp', nativeEvidenceSubmittedAt: at, lastCompletedAt: new Date('2026-02-01') },
        fingerprint: 'fp',
      }),
    ).toBe(false);
  });
  it('is false when the evidence changed', () => {
    expect(
      alreadySubmitted({
        task: { nativeEvidenceFingerprint: 'old', nativeEvidenceSubmittedAt: at, lastCompletedAt: null },
        fingerprint: 'fp',
      }),
    ).toBe(false);
  });
});

describe('NativeEvidenceController', () => {
  const svc = { getStatus: jest.fn(), submit: jest.fn() };
  const controller = new NativeEvidenceController(svc as unknown as NativeEvidenceService);

  it('gates status with task:read and submit with task:update', () => {
    const proto = NativeEvidenceController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.getStatus)).toEqual([{ resource: 'task', actions: ['read'] }]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.submit)).toEqual([{ resource: 'task', actions: ['update'] }]);
  });

  it('submits on behalf of the caller, forcing past the unchanged check', async () => {
    await controller.submit('org_1', { userId: 'usr_1' } as never, 'tsk_1');
    expect(svc.submit).toHaveBeenCalledWith({ organizationId: 'org_1', taskId: 'tsk_1', userId: 'usr_1', force: true });
  });
});
