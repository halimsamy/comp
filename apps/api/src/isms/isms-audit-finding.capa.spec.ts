import { db } from '@db';
import {
  IsmsAuditFindingService,
  isCapaOnlyUpdate,
} from './isms-audit-finding.service';

jest.mock('@db', () => {
  const db = {
    ismsDocument: { findUnique: jest.fn(), update: jest.fn() },
    member: { findFirst: jest.fn() },
    ismsAuditControl: { findFirst: jest.fn() },
    ismsAuditFinding: { findFirst: jest.fn(), update: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
  };
  return { db };
});

const mockDb = jest.mocked(db);

describe('isCapaOnlyUpdate', () => {
  it('is true when only corrective-action fields are set', () => {
    expect(
      isCapaOnlyUpdate({ rootCause: 'No review owner', correctiveAction: 'Assign one' }),
    ).toBe(true);
  });

  it('is false when any other field changes', () => {
    expect(isCapaOnlyUpdate({ rootCause: 'x', description: 'y' })).toBe(false);
  });

  it('is false for an empty update', () => {
    expect(isCapaOnlyUpdate({})).toBe(false);
  });
});

describe('IsmsAuditFindingService corrective action (10.2)', () => {
  const service = new IsmsAuditFindingService();

  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.ismsAuditFinding.findFirst as jest.Mock).mockResolvedValue({
      id: 'af_1',
      auditId: 'aud_1',
      documentId: 'doc_1',
    });
    (mockDb.ismsAuditFinding.update as jest.Mock).mockResolvedValue({});
    (mockDb.ismsDocument.findUnique as jest.Mock).mockResolvedValue({
      status: 'approved',
    });
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue({ id: 'mem_1' });
  });

  it('records root cause, action and effectiveness review without reopening approval', async () => {
    await service.update({
      findingId: 'af_1',
      organizationId: 'org_1',
      dto: {
        rootCause: '  Reviewer left the company ',
        correctiveAction: 'Assigned a deputy reviewer',
        effectivenessReviewedAt: '2026-11-01',
        effectivenessReviewedById: 'mem_1',
        effectivenessNotes: 'Two reviews on time since.',
      },
    });

    const { data } = (mockDb.ismsAuditFinding.update as jest.Mock).mock.calls[0][0];
    expect(data.rootCause).toBe('Reviewer left the company');
    expect(data.correctiveAction).toBe('Assigned a deputy reviewer');
    expect(data.effectivenessReviewedAt).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    expect(data.effectivenessReviewedById).toBe('mem_1');
    expect(mockDb.ismsDocument.update).not.toHaveBeenCalled();
  });

  it('still reverts an approved document when the finding itself changes', async () => {
    await service.update({
      findingId: 'af_1',
      organizationId: 'org_1',
      dto: { description: 'Reworded finding', rootCause: 'x' },
    });
    expect(mockDb.ismsDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }),
    );
  });

  it('rejects an effectiveness reviewer who is not an active member', async () => {
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.update({
        findingId: 'af_1',
        organizationId: 'org_1',
        dto: { effectivenessReviewedById: 'mem_gone' },
      }),
    ).rejects.toThrow('Active member not found');
  });
});
