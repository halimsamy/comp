import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { OwnershipNotifier } from '../notifications/ownership-notifier.service';
import { VulnerabilitiesService } from './vulnerabilities.service';

jest.mock('@db', () => ({
  db: {
    asset: { findFirst: jest.fn() },
    member: { findFirst: jest.fn(), findMany: jest.fn() },
    attachment: { findMany: jest.fn() },
    vulnerabilitySlaPolicy: { findUnique: jest.fn() },
    integrationPlatformFinding: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockDb = db as unknown as {
  asset: { findFirst: jest.Mock };
  member: Record<'findFirst' | 'findMany', jest.Mock>;
  attachment: { findMany: jest.Mock };
  vulnerabilitySlaPolicy: { findUnique: jest.Mock };
  integrationPlatformFinding: Record<
    'findMany' | 'findFirst' | 'findFirstOrThrow' | 'create' | 'update',
    jest.Mock
  >;
};

const ORG = 'org_1';
const stored = {
  id: 'ipf_1',
  status: 'open',
  slaDueAt: new Date('2020-01-01'),
  acceptedById: null,
  connection: null,
  owner: null,
  asset: null,
};
const current = (over: Record<string, unknown> = {}) => ({
  id: 'ipf_1',
  title: 'Weak TLS',
  source: 'manual',
  status: 'open',
  severity: 'medium',
  statusNote: null,
  ownerId: null,
  assetId: null,
  acceptedUntil: null,
  acceptedById: null,
  ...over,
});
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('VulnerabilitiesService', () => {
  const upload = jest.fn();
  const notify = jest.fn();
  const service = new VulnerabilitiesService(
    { uploadAttachment: upload } as unknown as AttachmentsService,
    { notify } as unknown as OwnershipNotifier,
  );
  const actor = { userId: 'usr_1', memberId: 'mem_me' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.vulnerabilitySlaPolicy.findUnique.mockResolvedValue(null);
    mockDb.member.findMany.mockResolvedValue([]);
    mockDb.member.findFirst.mockImplementation(({ where }) => ({
      id: where.id,
    }));
    mockDb.attachment.findMany.mockResolvedValue([]);
    mockDb.integrationPlatformFinding.create.mockResolvedValue({
      id: 'ipf_1',
      title: 'Weak TLS',
      ownerId: 'mem_1',
    });
    mockDb.integrationPlatformFinding.findFirstOrThrow.mockResolvedValue(
      stored,
    );
  });

  it('lists org findings with a computed SLA status', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([stored]);
    const [row] = await service.list(ORG);
    expect(
      mockDb.integrationPlatformFinding.findMany.mock.calls[0][0].where,
    ).toEqual({ organizationId: ORG });
    expect(row.slaStatus).toBe('overdue');
    expect(row.evidence).toEqual([]);
  });

  it('logs a manual finding with the org SLA and notifies the asset owner', async () => {
    mockDb.vulnerabilitySlaPolicy.findUnique.mockResolvedValue({
      criticalDays: 14,
      highDays: 30,
      mediumDays: 60,
      lowDays: 90,
    });
    mockDb.asset.findFirst.mockResolvedValue({
      id: 'ast_1',
      name: 'db-prod',
      ownerId: 'mem_1',
    });
    await service.create({
      organizationId: ORG,
      actor,
      dto: {
        title: 'Weak TLS',
        severity: 'critical',
        assetId: 'ast_1',
        firstSeenAt: '2026-11-01',
        cveId: 'cve-2024-1',
      },
    });
    expect(
      mockDb.integrationPlatformFinding.create.mock.calls[0][0].data,
    ).toMatchObject({
      organizationId: ORG,
      assetId: 'ast_1',
      ownerId: 'mem_1',
      cveId: 'CVE-2024-1',
      slaDueAt: new Date('2026-11-15T00:00:00Z'),
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'mem_1',
        entityType: 'vulnerability',
      }),
    );
  });

  it('requires a note for a false positive and stores an optional evidence file', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(current());
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        dto: { status: 'false_positive' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const evidence = {
      fileName: 'dispute.pdf',
      fileType: 'application/pdf',
      fileData: 'AA==',
    };
    await service.update({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      actor,
      dto: { status: 'false_positive', statusNote: 'Banner only', evidence },
    });
    expect(
      mockDb.integrationPlatformFinding.update.mock.calls[0][0],
    ).toMatchObject({
      where: { id: 'ipf_1', organizationId: ORG },
      data: { status: 'false_positive', statusNote: 'Banner only' },
    });
    expect(upload).toHaveBeenCalledWith(
      ORG,
      'ipf_1',
      'vulnerability',
      evidence,
      'usr_1',
    );
  });

  it('rejects a risk acceptance approved by the requester', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(current());
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        actor,
        dto: {
          status: 'risk_accepted',
          statusNote: 'Compensating WAF rule',
          acceptedUntil: inDays(30),
          acceptedById: 'mem_me',
        },
      }),
    ).rejects.toThrow('Someone other than you');
  });

  it('blocks accepting a critical finding on an in-scope asset', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(
      current({ severity: 'critical', assetId: 'ast_cde' }),
    );
    mockDb.asset.findFirst.mockResolvedValue({ cdeScope: 'in_scope' });
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        actor,
        dto: {
          status: 'risk_accepted',
          statusNote: 'Later',
          acceptedUntil: inDays(30),
          acceptedById: 'mem_cto',
        },
      }),
    ).rejects.toThrow('cannot be risk-accepted');
  });

  it('accepts a medium risk with an approver and expiry', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(current());
    await service.update({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      actor,
      dto: {
        status: 'risk_accepted',
        statusNote: 'Internal only',
        acceptedUntil: inDays(60),
        acceptedById: 'mem_cto',
      },
    });
    const data = mockDb.integrationPlatformFinding.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'risk_accepted',
      acceptedById: 'mem_cto',
    });
    expect(data.acceptedUntil).toEqual(expect.any(Date));
  });

  it('links an asset and hands an unowned finding to the asset owner', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(current());
    mockDb.asset.findFirst
      .mockResolvedValueOnce({ id: 'ast_1', name: 'web', ownerId: 'mem_web' })
      .mockResolvedValueOnce({ cdeScope: 'connected' });
    await service.update({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      actor,
      dto: { assetId: 'ast_1' },
    });
    expect(
      mockDb.integrationPlatformFinding.update.mock.calls[0][0].data,
    ).toMatchObject({ assetId: 'ast_1', ownerId: 'mem_web' });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'mem_web' }),
    );
  });

  it('does not let people resolve integration findings by hand', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(
      current({ source: 'integration' }),
    );
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        dto: { status: 'resolved' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps resolvedAt when an imported finding is resolved', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue(
      current({ source: 'asv_scan' }),
    );
    await service.update({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      dto: { status: 'resolved' },
    });
    expect(
      mockDb.integrationPlatformFinding.update.mock.calls[0][0].data.resolvedAt,
    ).toEqual(expect.any(Date));
  });
});
