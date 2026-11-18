jest.mock('@db', () => ({
  db: {
    task: { findFirst: jest.fn(), update: jest.fn() },
    accessReview: { findFirst: jest.fn(), update: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@trycompai/integration-platform', () => ({
  TASK_TEMPLATES: { accessReviewLog: 'frk_tt_arl' },
}));
jest.mock('./access-review-report', () => ({
  renderAccessReviewPdf: jest.fn(() => Buffer.from('%PDF-1.3')),
}));

import { db } from '@db';
import type { AttachmentsService } from '../attachments/attachments.service';
import { AccessReviewEvidenceService } from './access-review-evidence.service';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';

describe('AccessReviewEvidenceService.attachToTask', () => {
  const attachments = { uploadAttachment: jest.fn() };
  const service = new AccessReviewEvidenceService(
    attachments as unknown as AttachmentsService,
  );
  const signedOffAt = new Date('2026-11-18T10:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    mocked(db.accessReview.findFirst).mockResolvedValue({
      id: 'arv_1',
      name: 'H2 2026',
      items: [],
      systems: [],
    });
    mocked(db.organization.findUnique).mockResolvedValue({
      name: 'Acme',
      primaryColor: null,
    });
    mocked(db.$transaction).mockResolvedValue([]);
    attachments.uploadAttachment.mockResolvedValue({ id: 'att_1' });
  });

  it('attaches the PDF to the Access Review Log task and completes it', async () => {
    mocked(db.task.findFirst).mockResolvedValue({
      id: 'tsk_1',
      frequency: 'semiannually',
      status: 'todo',
    });

    await service.attachToTask({
      organizationId: ORG,
      id: 'arv_1',
      userId: 'usr_1',
      signedOffAt,
    });

    expect(db.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, taskTemplateId: 'frk_tt_arl' },
      }),
    );
    expect(attachments.uploadAttachment).toHaveBeenCalledWith(
      ORG,
      'tsk_1',
      'task',
      expect.objectContaining({
        fileName: 'access-review-h2-2026.pdf',
        fileType: 'application/pdf',
      }),
      'usr_1',
    );
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_1' },
      data: expect.objectContaining({
        status: 'done',
        lastCompletedAt: signedOffAt,
      }),
    });
    expect(db.accessReview.update).toHaveBeenCalledWith({
      where: { id: 'arv_1' },
      data: { taskId: 'tsk_1', reportAttachmentId: 'att_1' },
    });
  });

  it('does nothing when the organization has no Access Review Log task', async () => {
    mocked(db.task.findFirst).mockResolvedValue(null);
    await service.attachToTask({
      organizationId: ORG,
      id: 'arv_1',
      signedOffAt,
    });
    expect(attachments.uploadAttachment).not.toHaveBeenCalled();
  });

  it('attaches without completing a task marked not relevant', async () => {
    mocked(db.task.findFirst).mockResolvedValue({
      id: 'tsk_1',
      frequency: null,
      status: 'not_relevant',
    });
    await service.attachToTask({
      organizationId: ORG,
      id: 'arv_1',
      signedOffAt,
    });
    expect(db.task.update).not.toHaveBeenCalled();
    expect(db.accessReview.update).toHaveBeenCalled();
  });
});
