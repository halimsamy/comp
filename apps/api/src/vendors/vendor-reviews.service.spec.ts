import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    db.taskItem.createMany.mockImplementation((args: unknown) => args);
    db.user.findUnique.mockResolvedValue({ name: 'Ada', email: 'ada@x.com' });
    db.member.findFirst.mockResolvedValue({ id: 'mem_1' });
    db.vendorDocument.findMany.mockResolvedValue([{ id: 'vdoc_1' }]);
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
      dto: {
        outcome: 'approved',
        checklist: { ...checklist, riskReassessed: true },
        pciStatus: 'compliant',
        reviewedDocumentIds: ['vdoc_1', 'vdoc_other_vendor'],
        notes: 'ok',
      },
    })) as unknown as {
      data: {
        nextReviewDue: Date;
        reviewedByName: string;
        reviewedDocumentIds: string[];
        pciStatus: string;
      };
    };

    expect(review.data.reviewedByName).toBe('Ada');
    expect(review.data.pciStatus).toBe('compliant');
    // Only documents of this vendor in this org are kept.
    expect(db.vendorDocument.findMany.mock.calls[0][0].where).toMatchObject({
      vendorId: 'vnd_1',
      organizationId: orgId,
    });
    expect(review.data.reviewedDocumentIds).toEqual(['vdoc_1']);
    const months =
      (review.data.nextReviewDue.getTime() - before) / (30 * 86_400_000);
    expect(months).toBeGreaterThan(5.8);
    expect(months).toBeLessThan(6.3);
    const vendorUpdate = db.vendor.update.mock.calls[0][0];
    expect(vendorUpdate.data).toMatchObject({
      status: 'assessed',
      pciStatus: 'compliant',
    });
    expect(vendorUpdate.data.pciStatusCheckedAt).toBeInstanceOf(Date);
    expect(db.taskItem.updateMany.mock.calls[0][0].where).toMatchObject({
      organizationId: orgId,
      entityId: 'vnd_1',
      title: {
        in: ['Complete periodic vendor review', 'Verify risk assessment'],
      },
    });
    expect(db.taskItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects an approval with an unchecked item or an unknown PCI status', async () => {
    db.vendor.findFirst.mockResolvedValue({
      id: 'vnd_1',
      criticality: 'high',
      handlesCardholderData: true,
      affectsCdeSecurity: false,
    });
    await expect(
      service.signOff({
        vendorId: 'vnd_1',
        organizationId: orgId,
        userId: 'usr_1',
        dto: { outcome: 'approved', checklist, pciStatus: 'compliant' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.signOff({
        vendorId: 'vnd_1',
        organizationId: orgId,
        userId: 'usr_1',
        dto: {
          outcome: 'approved_with_conditions',
          checklist,
          pciStatus: 'unknown',
          conditions: ['x'],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
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
        conditions: ['Get the 2026 SOC 2 bridge letter', ' '],
        nextReviewDue: '2027-01-01T00:00:00Z',
      },
    });
    const { data: actions } = db.taskItem.createMany.mock.calls[0][0];
    expect(actions).toEqual([
      expect.objectContaining({
        title: 'Get the 2026 SOC 2 bridge letter',
        entityType: 'vendor',
        entityId: 'vnd_1',
        organizationId: orgId,
        createdById: 'mem_1',
      }),
    ]);
    const vendorUpdate = db.vendor.update.mock.calls[0][0];
    expect(vendorUpdate.data.nextReviewDue).toEqual(
      new Date('2027-01-01T00:00:00Z'),
    );
    expect(vendorUpdate.data.pciStatusCheckedAt).toBeUndefined();
  });
});
