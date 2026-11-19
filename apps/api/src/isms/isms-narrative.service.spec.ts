import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { IsmsNarrativeService } from './isms-narrative.service';

jest.mock('@db', () => {
  const db = {
    ismsDocument: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    policy: { findFirst: jest.fn() },
    // Advisory lock taken by invalidateApprovalIfNeeded (serializes vs approve).
    $executeRaw: jest.fn(),
    // Run the callback with the same mock as the transaction client.
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
  };
  return { db };
});

const mockDb = jest.mocked(db);

const validScope = {
  certificateScopeSentence: 'The ISMS covers Acme.',
  inScope: 'Everything.',
  interfaces: ['Suppliers'],
  dependencies: ['Cloud'],
  exclusions: [],
};

describe('IsmsNarrativeService', () => {
  let service: IsmsNarrativeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IsmsNarrativeService();
    (mockDb.ismsDocument.update as jest.Mock).mockResolvedValue({
      id: 'doc_1',
    });
  });

  it('throws NotFoundException when document missing', async () => {
    (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.save({
        documentId: 'doc_1',
        organizationId: 'org_1',
        narrative: validScope,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a register-type document that has no narrative schema', async () => {
    (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc_1',
      type: 'interested_parties_register',
    });
    await expect(
      service.save({
        documentId: 'doc_1',
        organizationId: 'org_1',
        narrative: validScope,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a narrative that fails zod validation', async () => {
    (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc_1',
      type: 'isms_scope',
    });
    await expect(
      service.save({
        documentId: 'doc_1',
        organizationId: 'org_1',
        narrative: { certificateScopeSentence: 123 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes the validated narrative onto the document draft (CS-701)', async () => {
    (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc_1',
      type: 'isms_scope',
    });
    // Non-approved: invalidateApprovalIfNeeded is a no-op.
    (mockDb.ismsDocument.findUnique as jest.Mock).mockResolvedValue({
      status: 'draft',
    });

    await service.save({
      documentId: 'doc_1',
      organizationId: 'org_1',
      narrative: validScope,
    });

    // The draft narrative lives on IsmsDocument, never on a version row.
    expect(mockDb.ismsDocument.update).toHaveBeenCalledTimes(1);
    expect(mockDb.ismsDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc_1' },
      data: {
        draftNarrative: expect.objectContaining({
          certificateScopeSentence: 'The ISMS covers Acme.',
        }),
      },
      select: { id: true, draftNarrative: true },
    });
  });

  it('reverts an approved document to draft, then writes the narrative', async () => {
    (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc_1',
      type: 'isms_scope',
    });
    (mockDb.ismsDocument.findUnique as jest.Mock).mockResolvedValue({
      status: 'approved',
    });

    await service.save({
      documentId: 'doc_1',
      organizationId: 'org_1',
      narrative: validScope,
    });

    // First the approval invalidation, then the narrative write — both in-tx.
    expect(mockDb.ismsDocument.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'doc_1' },
      data: { status: 'draft', approvedAt: null, approverId: null },
    });
    expect(mockDb.ismsDocument.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'doc_1' },
      data: {
        draftNarrative: expect.objectContaining({
          certificateScopeSentence: 'The ISMS covers Acme.',
        }),
      },
      select: { id: true, draftNarrative: true },
    });
  });

  describe('governing policy link (9.2 / 9.3)', () => {
    const linked = { programme: 'Annual audit.', governingPolicyId: 'pol_1' };

    beforeEach(() => {
      (mockDb.ismsDocument.findFirst as jest.Mock).mockResolvedValue({
        id: 'doc_1',
        type: 'internal_audit',
      });
      (mockDb.ismsDocument.findUnique as jest.Mock).mockResolvedValue({
        status: 'draft',
      });
    });

    it('checks the policy within the org, excluding archived ones', async () => {
      (mockDb.policy.findFirst as jest.Mock).mockResolvedValue({ name: 'IA' });
      await service.save({
        documentId: 'doc_1',
        organizationId: 'org_1',
        narrative: linked,
      });
      expect(mockDb.policy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'pol_1',
            organizationId: 'org_1',
            isArchived: false,
            archivedAt: null,
          },
        }),
      );
      expect(mockDb.ismsDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { draftNarrative: linked },
        }),
      );
    });

    it("rejects another org's or an archived policy and writes nothing", async () => {
      (mockDb.policy.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.save({
          documentId: 'doc_1',
          organizationId: 'org_1',
          narrative: linked,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockDb.ismsDocument.update).not.toHaveBeenCalled();
    });

    it('skips the policy check when nothing is linked', async () => {
      await service.save({
        documentId: 'doc_1',
        organizationId: 'org_1',
        narrative: { programme: 'Annual audit.' },
      });
      expect(mockDb.policy.findFirst).not.toHaveBeenCalled();
    });
  });
});
