import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { IsmsNonconformityService } from './isms-nonconformity.service';

jest.mock('@db', () => {
  const db = {
    member: { findFirst: jest.fn() },
    ismsAuditFinding: { findMany: jest.fn() },
    finding: { findMany: jest.fn() },
    ismsNonconformity: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
  };
  return { db };
});

const mockDb = jest.mocked(db);

describe('IsmsNonconformityService', () => {
  const service = new IsmsNonconformityService();

  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.ismsNonconformity.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.ismsAuditFinding.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.finding.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue({ id: 'mem_1' });
  });

  it('lists standalone rows and internal-audit nonconformities together', async () => {
    (mockDb.ismsNonconformity.findMany as jest.Mock).mockResolvedValue([
      { id: 'nc_1', reference: 'NC-01', source: 'incident', status: 'open' },
    ]);
    (mockDb.ismsAuditFinding.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'af_1',
        reference: 'F-02',
        type: 'nc_major',
        audit: { reference: 'IA-2026-01' },
        clauseOrControl: 'A.5.18',
        description: 'Access reviews missing',
        status: 'open',
      },
    ]);

    const result = await service.list({ organizationId: 'org_1' });

    expect(result.count).toBe(2);
    expect(result.data[0]).toMatchObject({ kind: 'standalone', reference: 'NC-01' });
    expect(result.data[1]).toMatchObject({
      kind: 'audit_finding',
      reference: 'IA-2026-01 F-02',
      source: 'internal_audit',
      severity: 'major',
    });
    // Only nonconformities, and only this organization's audits.
    expect(mockDb.ismsAuditFinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: { in: ['nc_major', 'nc_minor'] },
          audit: { document: { organizationId: 'org_1', type: 'internal_audit' } },
        },
      }),
    );
  });

  it('includes auditor findings as read-only external findings (#171)', async () => {
    (mockDb.finding.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'fnd_abc123',
        status: 'ready_for_review',
        severity: 'high',
        content: 'No evidence of quarterly access reviews',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        audit: { title: 'ISO 27001 Stage 2' },
      },
    ]);

    const result = await service.list({ organizationId: 'org_1' });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'fnd_abc123',
        kind: 'external_finding',
        reference: 'FND-ABC123',
        source: 'external_audit',
        sourceRef: 'ISO 27001 Stage 2',
        severity: 'high',
        status: 'in_progress',
      }),
    ]);
    expect(mockDb.finding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } }),
    );
  });

  it('imports a log with references numbered in order', async () => {
    (mockDb.ismsNonconformity.findMany as jest.Mock).mockResolvedValue([
      { reference: 'NC-03' },
    ]);
    (mockDb.ismsNonconformity.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await service.importMany({
      organizationId: 'org_1',
      rows: [
        { source: 'other', description: ' Firewall rule review late ' },
        { source: 'other', description: 'Leaver not removed', status: 'closed' },
      ],
    });

    expect(result).toEqual({ count: 2 });
    const { data } = (mockDb.ismsNonconformity.createMany as jest.Mock).mock.calls[0][0];
    expect(data.map((row: { reference: string }) => row.reference)).toEqual(['NC-04', 'NC-05']);
    expect(data[0]).toMatchObject({ organizationId: 'org_1', description: 'Firewall rule review late' });
    expect(data[1].status).toBe('closed');
  });

  it('creates with the next NC reference past deleted numbers', async () => {
    (mockDb.ismsNonconformity.findMany as jest.Mock).mockResolvedValue([
      { reference: 'NC-01' },
      { reference: 'NC-04' },
    ]);
    await service.create({
      organizationId: 'org_1',
      dto: {
        source: 'external_audit',
        description: ' Stage 1 finding ',
        ownerMemberId: 'mem_1',
        dueDate: '2026-12-31',
      },
    });
    expect(mockDb.ismsNonconformity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        reference: 'NC-05',
        description: 'Stage 1 finding',
        ownerMemberId: 'mem_1',
        dueDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'open',
      }),
    });
  });

  it('rejects an owner outside the organization', async () => {
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.create({
        organizationId: 'org_1',
        dto: { source: 'incident', description: 'x', ownerMemberId: 'mem_other' },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates only rows of the caller organization', async () => {
    (mockDb.ismsNonconformity.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.update({ id: 'nc_x', organizationId: 'org_1', dto: { status: 'closed' } }),
    ).rejects.toThrow(NotFoundException);

    (mockDb.ismsNonconformity.findFirst as jest.Mock).mockResolvedValue({ id: 'nc_1' });
    await service.update({
      id: 'nc_1',
      organizationId: 'org_1',
      dto: { status: 'closed', rootCause: null, effectivenessReviewedAt: '2026-11-18' },
    });
    const { data } = (mockDb.ismsNonconformity.update as jest.Mock).mock.calls[0][0];
    expect(data.status).toBe('closed');
    expect(data.rootCause).toBeNull();
    expect(data.correctiveAction).toBeUndefined();
    expect(data.effectivenessReviewedAt).toEqual(new Date('2026-11-18T00:00:00.000Z'));
  });

  it('deletes after the org check', async () => {
    (mockDb.ismsNonconformity.findFirst as jest.Mock).mockResolvedValue({ id: 'nc_1' });
    await expect(service.remove({ id: 'nc_1', organizationId: 'org_1' })).resolves.toEqual({
      success: true,
    });
    expect(mockDb.ismsNonconformity.findFirst).toHaveBeenCalledWith({
      where: { id: 'nc_1', organizationId: 'org_1' },
      select: { id: true },
    });
  });
});
