import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { markInventoryReviewed } from './asset-review';

jest.mock('@db', () => ({
  db: {
    asset: { updateMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    member: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const mockDb = db as unknown as {
  asset: Record<'updateMany' | 'count' | 'findFirst', jest.Mock>;
  member: { findFirst: jest.Mock };
  auditLog: { create: jest.Mock };
};

const ORG = 'org_1';
const now = new Date('2026-11-18T10:00:00Z');

describe('markInventoryReviewed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.asset.updateMany.mockResolvedValue({ count: 33 });
    mockDb.asset.count.mockResolvedValue(4);
    mockDb.asset.findFirst.mockResolvedValue({
      lastReviewedAt: now,
      lastReviewedById: 'mem_1',
    });
    mockDb.member.findFirst.mockResolvedValue({
      id: 'mem_1',
      user: { name: 'Ana', email: 'ana@x.com' },
    });
  });

  it('stamps active assets of the org, logs the 12.5.2 confirmation and returns the reviewer', async () => {
    const result = await markInventoryReviewed({
      organizationId: ORG,
      actor: { userId: 'usr_1', memberId: 'mem_1' },
      now,
    });
    expect(mockDb.asset.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, archivedAt: null },
      data: { lastReviewedAt: now, lastReviewedById: 'mem_1' },
    });
    expect(mockDb.auditLog.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      userId: 'usr_1',
      memberId: 'mem_1',
      data: { action: 'asset_inventory_reviewed', assets: 33, unassessed: 4 },
    });
    expect(result).toEqual({
      lastReviewedAt: now,
      reviewedBy: { id: 'mem_1', name: 'Ana', email: 'ana@x.com' },
    });
  });

  it('needs a signed-in member (API keys cannot confirm a review)', async () => {
    await expect(
      markInventoryReviewed({ organizationId: ORG, actor: {}, now }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.asset.updateMany).not.toHaveBeenCalled();
  });
});
