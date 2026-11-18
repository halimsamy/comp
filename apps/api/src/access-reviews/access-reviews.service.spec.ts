jest.mock('@db', () => ({
  db: {
    member: { findMany: jest.fn(), findFirst: jest.fn() },
    accessReview: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    accessReviewItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import type { AccessAccountsService } from './access-accounts.service';
import type { AccessReviewEvidenceService } from './access-review-evidence.service';
import { AccessReviewsService } from './access-reviews.service';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';

describe('AccessReviewsService', () => {
  const accounts = { getSystemAccounts: jest.fn() };
  const evidence = { attachToTask: jest.fn() };
  const service = new AccessReviewsService(
    accounts as unknown as AccessAccountsService,
    evidence as unknown as AccessReviewEvidenceService,
  );
  const tx = {
    accessReview: { create: jest.fn() },
    accessReviewSystem: { create: jest.fn() },
    accessReviewItem: { createMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mocked(db.$transaction).mockImplementation(
      (fn: (t: typeof tx) => unknown) => fn(tx),
    );
    mocked(db.member.findFirst).mockResolvedValue({
      user: { name: 'Admin', email: 'a@x.com' },
    });
    mocked(db.accessReview.findFirst).mockResolvedValue({
      id: 'arv_1',
      status: 'in_progress',
      items: [],
      systems: [],
    });
  });

  describe('create', () => {
    const account = {
      accountId: 'jane@acme.com',
      name: 'Jane',
      email: 'jane@acme.com',
      type: 'human',
      status: 'active',
      roles: ['owner'],
      isAdmin: true,
      mfaEnabled: null,
      lastLoginAt: null,
      owner: { memberId: 'mem_jane', name: 'Jane' },
      isServiceAccount: false,
      flags: ['admin'],
    };

    it('snapshots every system with its reviewer', async () => {
      mocked(db.member.findMany).mockResolvedValue([
        { id: 'mem_rev', user: { name: 'Rev', email: 'r@x.com' } },
      ]);
      accounts.getSystemAccounts.mockResolvedValue({
        system: { key: 'compai', name: 'Comp AI' },
        accounts: [account],
      });
      tx.accessReview.create.mockResolvedValue({ id: 'arv_1' });
      tx.accessReviewSystem.create.mockResolvedValue({ id: 'ars_1' });

      await service.create({
        organizationId: ORG,
        callerMemberId: 'mem_admin',
        dto: {
          name: 'H2',
          dueDate: '2026-12-31',
          systems: [{ systemKey: 'compai', reviewerMemberId: 'mem_rev' }],
        },
      });

      expect(db.member.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['mem_rev'] },
            organizationId: ORG,
            deactivated: false,
          },
        }),
      );
      expect(tx.accessReviewSystem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reviewerId: 'mem_rev',
          reviewerName: 'Rev',
          systemName: 'Comp AI',
        }),
      });
      expect(tx.accessReviewItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            organizationId: ORG,
            reviewId: 'arv_1',
            reviewSystemId: 'ars_1',
            ownerMemberId: 'mem_jane',
            flags: ['admin'],
          }),
        ],
      });
    });

    it('rejects reviewers from another organization', async () => {
      mocked(db.member.findMany).mockResolvedValue([]);
      await expect(
        service.create({
          organizationId: ORG,
          dto: {
            name: 'H2',
            dueDate: '2026-12-31',
            systems: [{ systemKey: 'compai', reviewerMemberId: 'mem_x' }],
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a review with nothing to review', async () => {
      mocked(db.member.findMany).mockResolvedValue([]);
      accounts.getSystemAccounts.mockResolvedValue({
        system: { key: 'compai', name: 'Comp AI' },
        accounts: [],
      });
      await expect(
        service.create({
          organizationId: ORG,
          dto: {
            name: 'H2',
            dueDate: '2026-12-31',
            systems: [{ systemKey: 'compai' }],
          },
        }),
      ).rejects.toThrow('no accounts');
    });
  });

  describe('decide', () => {
    it('updates only items of this review in this organization', async () => {
      mocked(db.accessReviewItem.updateMany).mockResolvedValue({ count: 2 });
      const result = await service.decide({
        organizationId: ORG,
        id: 'arv_1',
        callerMemberId: 'mem_admin',
        dto: { itemIds: ['ari_1', 'ari_2'], decision: 'keep' },
      });
      expect(result).toEqual({ updated: 2 });
      expect(db.accessReviewItem.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['ari_1', 'ari_2'] },
          reviewId: 'arv_1',
          organizationId: ORG,
        },
        data: expect.objectContaining({
          decision: 'keep',
          decidedById: 'mem_admin',
          decidedByName: 'Admin',
        }),
      });
    });

    it('requires a note for modify decisions', async () => {
      await expect(
        service.decide({
          organizationId: ORG,
          id: 'arv_1',
          callerMemberId: 'mem_admin',
          dto: { itemIds: ['ari_1'], decision: 'modify' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a signed-in member (not an API key)', async () => {
      await expect(
        service.decide({
          organizationId: ORG,
          id: 'arv_1',
          dto: { itemIds: ['ari_1'], decision: 'keep' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses changes after sign-off', async () => {
      mocked(db.accessReview.findFirst).mockResolvedValue({
        id: 'arv_1',
        status: 'completed',
      });
      await expect(
        service.decide({
          organizationId: ORG,
          id: 'arv_1',
          callerMemberId: 'mem_admin',
          dto: { itemIds: ['ari_1'], decision: 'keep' },
        }),
      ).rejects.toThrow('already signed off');
    });

    it('404s for a review of another organization', async () => {
      mocked(db.accessReview.findFirst).mockResolvedValue(null);
      await expect(
        service.decide({
          organizationId: ORG,
          id: 'arv_x',
          callerMemberId: 'mem_admin',
          dto: { itemIds: ['ari_1'], decision: 'keep' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
