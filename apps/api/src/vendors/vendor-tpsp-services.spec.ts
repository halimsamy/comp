import { NotFoundException } from '@nestjs/common';
import { tasks } from '@trycompai/jobs';
import { VendorDocumentsService } from './vendor-documents.service';
import { VendorReviewsService } from './vendor-reviews.service';

jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    vendor: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    vendorDocument: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vendorReview: { findMany: jest.fn(), create: jest.fn() },
    taskItem: { updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@trycompai/jobs', () => ({
  tasks: { trigger: jest.fn() },
}));

jest.mock('../attachments/attachments.service', () => ({
  AttachmentsService: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db') as {
  db: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
};

const orgId = 'org_1';

describe('VendorDocumentsService', () => {
  const attachments = {
    uploadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    getAttachmentDownloadUrl: jest.fn(),
  };
  const service = new VendorDocumentsService(attachments as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects documents for a vendor in another organization', async () => {
    db.vendor.findFirst.mockResolvedValue(null);
    await expect(
      service.list({ vendorId: 'vnd_x', organizationId: orgId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vnd_x', organizationId: orgId },
      }),
    );
  });

  it('uploads a SOC 2, defaults its expiry, syncs assurance and starts the AI summary', async () => {
    db.vendor.findFirst.mockResolvedValue({
      id: 'vnd_1',
      assuranceExpiresAt: null,
    });
    db.vendor.findUniqueOrThrow.mockResolvedValue({ assuranceExpiresAt: null });
    attachments.uploadAttachment.mockResolvedValue({ id: 'att_1' });
    const created = {
      id: 'vdoc_1',
      vendorId: 'vnd_1',
      type: 'soc2_type2',
      periodStart: new Date('2025-04-01T00:00:00Z'),
      periodEnd: new Date('2026-03-31T00:00:00Z'),
      expiresAt: new Date('2027-03-31T00:00:00Z'),
    };
    db.vendorDocument.create.mockResolvedValue(created);
    db.vendorDocument.findFirst.mockResolvedValue(created);
    db.vendorDocument.update.mockResolvedValue({
      ...created,
      aiSummaryStatus: 'pending',
    });
    (tasks.trigger as jest.Mock).mockResolvedValue({ id: 'run_1' });

    const result = await service.create({
      vendorId: 'vnd_1',
      organizationId: orgId,
      userId: 'usr_1',
      dto: {
        type: 'soc2_type2',
        fileName: 'soc2.pdf',
        fileType: 'application/pdf',
        fileData: 'JVBERi0=',
        periodStart: '2025-04-01T00:00:00Z',
        periodEnd: '2026-03-31T00:00:00Z',
      },
    });

    expect(attachments.uploadAttachment).toHaveBeenCalledWith(
      orgId,
      'vnd_1',
      'vendor',
      {
        fileName: 'soc2.pdf',
        fileType: 'application/pdf',
        fileData: 'JVBERi0=',
      },
      'usr_1',
    );
    expect(db.vendorDocument.create.mock.calls[0][0].data).toMatchObject({
      organizationId: orgId,
      attachmentId: 'att_1',
      name: 'soc2.pdf',
      expiresAt: new Date('2027-03-31T00:00:00Z'),
    });
    expect(db.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vnd_1' },
      data: expect.objectContaining({ assuranceType: 'soc2_type2' }),
    });
    expect(tasks.trigger).toHaveBeenCalledWith('vendor-document-summary', {
      documentId: 'vdoc_1',
      organizationId: orgId,
    });
    expect(result).toMatchObject({ aiSummaryStatus: 'pending' });
  });

  it('keeps the upload when the AI summary cannot be queued and closes the renewal reminder', async () => {
    db.vendor.findFirst.mockResolvedValue({ id: 'vnd_1' });
    db.vendor.findUniqueOrThrow.mockResolvedValue({ assuranceExpiresAt: null });
    attachments.uploadAttachment.mockResolvedValue({ id: 'att_3' });
    const created = {
      id: 'vdoc_3',
      organizationId: orgId,
      vendorId: 'vnd_1',
      type: 'pci_aoc',
      periodStart: null,
      periodEnd: null,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    };
    db.vendorDocument.create.mockResolvedValue(created);
    db.vendorDocument.findFirst.mockResolvedValue(created);
    db.vendorDocument.update.mockImplementation(({ data }) => ({
      ...created,
      ...data,
    }));
    (tasks.trigger as jest.Mock).mockRejectedValue(new Error('queue down'));

    const result = await service.create({
      vendorId: 'vnd_1',
      organizationId: orgId,
      dto: {
        type: 'pci_aoc',
        fileName: 'aoc.pdf',
        fileType: 'application/pdf',
        fileData: 'JVBERi0=',
      },
    });

    expect(result).toMatchObject({ id: 'vdoc_3', aiSummaryStatus: 'failed' });
    expect(db.taskItem.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: orgId,
        entityId: 'vnd_1',
        title: 'Request an updated PCI DSS AOC',
      }),
      data: { status: 'done' },
    });
  });

  it('does not summarize a DPA', async () => {
    db.vendor.findFirst.mockResolvedValue({ id: 'vnd_1' });
    db.vendor.findUniqueOrThrow.mockResolvedValue({ assuranceExpiresAt: null });
    attachments.uploadAttachment.mockResolvedValue({ id: 'att_2' });
    db.vendorDocument.create.mockResolvedValue({
      id: 'vdoc_2',
      vendorId: 'vnd_1',
      type: 'dpa',
      periodStart: null,
      periodEnd: null,
      expiresAt: null,
    });
    await service.create({
      vendorId: 'vnd_1',
      organizationId: orgId,
      dto: {
        type: 'dpa',
        fileName: 'dpa.pdf',
        fileType: 'application/pdf',
        fileData: 'JVBERi0=',
      },
    });
    expect(tasks.trigger).not.toHaveBeenCalled();
    expect(db.vendor.update).not.toHaveBeenCalled();
  });

  it('deletes the attachment scoped to the organization', async () => {
    db.vendorDocument.findFirst.mockResolvedValue({
      id: 'vdoc_1',
      attachmentId: 'att_1',
    });
    await service.remove({
      vendorId: 'vnd_1',
      documentId: 'vdoc_1',
      organizationId: orgId,
    });
    expect(db.vendorDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'vdoc_1', vendorId: 'vnd_1', organizationId: orgId },
    });
    expect(attachments.deleteAttachment).toHaveBeenCalledWith(orgId, 'att_1');
  });
});

describe('VendorReviewsService', () => {
  const service = new VendorReviewsService();
  const checklist = {
    assuranceReviewed: true,
    pciStatusConfirmed: true,
    contractReviewed: true,
    riskReassessed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
    db.vendorReview.create.mockImplementation((args: unknown) => args);
    db.vendor.update.mockImplementation((args: unknown) => args);
    db.taskItem.updateMany.mockImplementation((args: unknown) => args);
    db.user.findUnique.mockResolvedValue({ name: 'Ada', email: 'ada@x.com' });
  });

  it('404s for a vendor outside the organization', async () => {
    db.vendor.findFirst.mockResolvedValue(null);
    await expect(
      service.signOff({
        vendorId: 'vnd_x',
        organizationId: orgId,
        userId: 'usr_1',
        dto: { outcome: 'approved', checklist },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('signs off, schedules the next review by cadence and records the PCI check', async () => {
    db.vendor.findFirst.mockResolvedValue({
      id: 'vnd_1',
      criticality: 'critical',
      handlesCardholderData: true,
      affectsCdeSecurity: false,
    });
    const before = Date.now();
    const review = (await service.signOff({
      vendorId: 'vnd_1',
      organizationId: orgId,
      userId: 'usr_1',
      dto: { outcome: 'approved', checklist, notes: 'ok' },
    })) as unknown as {
      data: { nextReviewDue: Date; reviewedByName: string };
    };

    expect(review.data.reviewedByName).toBe('Ada');
    const months =
      (review.data.nextReviewDue.getTime() - before) / (30 * 86_400_000);
    expect(months).toBeGreaterThan(5.8);
    expect(months).toBeLessThan(6.3);
    const vendorUpdate = db.vendor.update.mock.calls[0][0];
    expect(vendorUpdate.data.pciStatusCheckedAt).toBeInstanceOf(Date);
    expect(db.taskItem.updateMany.mock.calls[0][0].where).toMatchObject({
      organizationId: orgId,
      entityId: 'vnd_1',
      title: 'Complete periodic vendor review',
    });
  });

  it('uses an explicit next review date and skips the PCI check when unconfirmed', async () => {
    db.vendor.findFirst.mockResolvedValue({
      id: 'vnd_1',
      criticality: null,
      handlesCardholderData: false,
      affectsCdeSecurity: false,
    });
    await service.signOff({
      vendorId: 'vnd_1',
      organizationId: orgId,
      userId: 'usr_1',
      dto: {
        outcome: 'approved_with_conditions',
        checklist: { ...checklist, pciStatusConfirmed: false },
        nextReviewDue: '2027-01-01T00:00:00Z',
      },
    });
    const vendorUpdate = db.vendor.update.mock.calls[0][0];
    expect(vendorUpdate.data.nextReviewDue).toEqual(
      new Date('2027-01-01T00:00:00Z'),
    );
    expect(vendorUpdate.data.pciStatusCheckedAt).toBeUndefined();
  });
});
