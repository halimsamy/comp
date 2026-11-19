import { NotFoundException } from '@nestjs/common';
import { tasks } from '@trycompai/jobs';
import { VendorDocumentsService } from './vendor-documents.service';

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
    taskItem: { updateMany: jest.fn(), createMany: jest.fn() },
    member: { findFirst: jest.fn() },
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
