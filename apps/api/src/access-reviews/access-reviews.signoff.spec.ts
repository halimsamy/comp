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
    attachment: { findMany: jest.fn().mockResolvedValue([]) },
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
import type { AttachmentsService } from '../attachments/attachments.service';
import type { AccessReviewEvidenceService } from './access-review-evidence.service';
import { AccessReviewsService } from './access-reviews.service';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';

describe('AccessReviewsService remediation and sign-off', () => {
  const accounts = { getSystemAccounts: jest.fn() };
  const evidence = { attachToTask: jest.fn() };
  const attachments = { uploadAttachment: jest.fn() };
  const service = new AccessReviewsService(
    accounts as unknown as AccessAccountsService,
    evidence as unknown as AccessReviewEvidenceService,
    attachments as unknown as AttachmentsService,
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
    mocked(db.accessReviewItem.findFirst).mockResolvedValue(null);
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

  describe('remediate', () => {
    it('only accepts revoke or modify decisions', async () => {
      mocked(db.accessReviewItem.findFirst).mockResolvedValue({
        decision: 'keep',
      });
      await expect(
        service.remediate({
          organizationId: ORG,
          id: 'arv_1',
          itemId: 'ari_1',
          dto: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks a revoke as done with a ticket link and a proof file (#90)', async () => {
      mocked(db.accessReviewItem.findFirst).mockResolvedValue({
        decision: 'revoke',
      });
      await service.remediate({
        organizationId: ORG,
        id: 'arv_1',
        itemId: 'ari_1',
        userId: 'usr_1',
        dto: {
          note: ' JIRA-1 ',
          url: 'https://jira.acme.com/browse/JIRA-1',
          fileName: 'proof.png',
          fileType: 'image/png',
          fileData: 'aGk=',
        },
      });
      expect(attachments.uploadAttachment).toHaveBeenCalledWith(
        ORG,
        'ari_1',
        'access_review_item',
        expect.objectContaining({ fileName: 'proof.png' }),
        'usr_1',
      );
      expect(db.accessReviewItem.update).toHaveBeenCalledWith({
        where: { id: 'ari_1' },
        data: {
          remediatedAt: expect.any(Date),
          remediationNote: 'JIRA-1',
          remediationUrl: 'https://jira.acme.com/browse/JIRA-1',
        },
      });
    });
  });

  describe('signOff', () => {
    const signOff = () =>
      service.signOff({
        organizationId: ORG,
        id: 'arv_1',
        callerMemberId: 'mem_admin',
        userId: 'usr_1',
        note: 'All good',
      });

    it('blocks sign-off while accounts are undecided', async () => {
      mocked(db.accessReviewItem.findMany).mockResolvedValue([
        { decision: null, flags: [], remediatedAt: null },
      ]);
      await expect(signOff()).rejects.toThrow(
        '1 accounts still need a decision',
      );
    });

    it('blocks sign-off while access changes are open', async () => {
      mocked(db.accessReviewItem.findMany).mockResolvedValue([
        { decision: 'revoke', flags: [], remediatedAt: null },
      ]);
      await expect(signOff()).rejects.toThrow(
        '1 access changes are not marked as done',
      );
    });

    it('completes the review and attaches the report to the task', async () => {
      mocked(db.accessReviewItem.findMany).mockResolvedValue([
        { decision: 'keep', flags: [], remediatedAt: null },
        {
          decision: 'revoke',
          flags: ['owner_departed'],
          remediatedAt: new Date(),
        },
      ]);
      await signOff();
      expect(db.accessReview.update).toHaveBeenCalledWith({
        where: { id: 'arv_1' },
        data: expect.objectContaining({
          status: 'completed',
          signedOffById: 'mem_admin',
          signedOffByName: 'Admin',
          signOffNote: 'All good',
        }),
      });
      expect(evidence.attachToTask).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          id: 'arv_1',
          userId: 'usr_1',
        }),
      );
    });

    it('403s when the caller started the review (#80)', async () => {
      mocked(db.accessReview.findFirst).mockResolvedValue({
        id: 'arv_1',
        status: 'in_progress',
        createdById: 'mem_admin',
      });
      await expect(signOff()).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.accessReview.update).not.toHaveBeenCalled();
    });

    it('lets a member whose own account is in the review sign off', async () => {
      mocked(db.accessReviewItem.findMany).mockResolvedValue([
        { decision: 'keep', flags: [], remediatedAt: null },
      ]);
      mocked(db.accessReviewItem.findFirst).mockResolvedValue({ id: 'ari_mine' });
      await expect(signOff()).resolves.toBeDefined();
    });

    it('keeps the sign-off when attaching the report fails', async () => {
      mocked(db.accessReviewItem.findMany).mockResolvedValue([
        { decision: 'keep', flags: [], remediatedAt: null },
      ]);
      evidence.attachToTask.mockRejectedValue(new Error('S3 down'));
      await expect(signOff()).resolves.toBeDefined();
    });
  });
});
