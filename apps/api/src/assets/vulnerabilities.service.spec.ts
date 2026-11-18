import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';

jest.mock('@db', () => ({
  db: {
    asset: { findFirst: jest.fn(), findMany: jest.fn() },
    member: { findFirst: jest.fn() },
    integrationPlatformFinding: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const mockDb = db as unknown as {
  asset: Record<'findFirst' | 'findMany', jest.Mock>;
  member: { findFirst: jest.Mock };
  integrationPlatformFinding: Record<
    'findMany' | 'findFirst' | 'create' | 'update' | 'updateMany',
    jest.Mock
  >;
};

const ORG = 'org_1';
const stored = {
  id: 'ipf_1',
  status: 'open',
  slaDueAt: new Date('2020-01-01'),
  connection: null,
  owner: null,
  asset: null,
};

describe('VulnerabilitiesService', () => {
  const service = new VulnerabilitiesService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.integrationPlatformFinding.create.mockResolvedValue(stored);
    mockDb.integrationPlatformFinding.update.mockResolvedValue(stored);
  });

  it('lists org findings with a computed SLA status', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([stored]);
    const [row] = await service.list(ORG);
    expect(
      mockDb.integrationPlatformFinding.findMany.mock.calls[0][0].where,
    ).toEqual({ organizationId: ORG });
    expect(row.slaStatus).toBe('overdue');
    expect(row.provider).toBeNull();
  });

  it('logs a manual finding on an asset with its SLA and the asset owner', async () => {
    mockDb.asset.findFirst.mockResolvedValue({
      id: 'ast_1',
      name: 'db-prod',
      ownerId: 'mem_1',
    });
    await service.create({
      organizationId: ORG,
      dto: {
        title: 'Weak TLS',
        severity: 'critical',
        assetId: 'ast_1',
        firstSeenAt: '2026-11-01',
        cveId: 'cve-2024-1',
      },
    });
    expect(mockDb.asset.findFirst.mock.calls[0][0].where).toEqual({
      id: 'ast_1',
      organizationId: ORG,
    });
    expect(
      mockDb.integrationPlatformFinding.create.mock.calls[0][0].data,
    ).toMatchObject({
      organizationId: ORG,
      source: 'manual',
      assetId: 'ast_1',
      ownerId: 'mem_1',
      cveId: 'CVE-2024-1',
      slaDueAt: new Date('2026-12-01T00:00:00Z'),
    });
  });

  it('requires a reason to ignore a finding', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue({
      id: 'ipf_1',
      source: 'manual',
      status: 'open',
      statusNote: null,
    });
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        dto: { status: 'ignored' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.update({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      dto: { status: 'ignored', statusNote: 'False positive' },
    });
    expect(
      mockDb.integrationPlatformFinding.update.mock.calls[0][0],
    ).toMatchObject({
      where: { id: 'ipf_1', organizationId: ORG },
      data: {
        status: 'ignored',
        resolvedAt: null,
        statusNote: 'False positive',
      },
    });
  });

  it('does not let people resolve integration findings by hand', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue({
      id: 'ipf_1',
      source: 'integration',
      status: 'open',
      statusNote: null,
    });
    await expect(
      service.update({
        organizationId: ORG,
        vulnerabilityId: 'ipf_1',
        dto: { status: 'resolved' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps resolvedAt when a manual finding is resolved', async () => {
    mockDb.integrationPlatformFinding.findFirst.mockResolvedValue({
      id: 'ipf_1',
      source: 'asv_scan',
      status: 'open',
      statusNote: null,
    });
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

describe('VulnerabilityImportService', () => {
  const importer = new VulnerabilityImportService();
  const csv =
    'Name,Severity,Host,CVE\nOpenSSL,High,web-1,CVE-2024-1\nCipher,Low,10.0.0.9,';

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.asset.findMany.mockResolvedValue([
      { id: 'ast_web', name: 'web-1', externalId: 'i-1', ownerId: 'mem_1' },
    ]);
  });

  it('creates new findings matched to assets and resolves missing ones on a rescan', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([
      { id: 'ipf_old', externalId: 'old', status: 'open' },
    ]);
    const result = await importer.import({
      organizationId: ORG,
      source: 'asv_scan',
      csv,
      resolveMissing: true,
    });

    expect(result).toEqual({
      created: 2,
      updated: 0,
      reopened: 0,
      resolved: 1,
      skipped: 0,
    });
    const created = mockDb.integrationPlatformFinding.create.mock.calls.map(
      ([arg]) => arg.data,
    );
    expect(created[0]).toMatchObject({
      organizationId: ORG,
      source: 'asv_scan',
      assetId: 'ast_web',
      ownerId: 'mem_1',
    });
    expect(created[1]).toMatchObject({ assetId: null, resourceId: '10.0.0.9' });
    expect(mockDb.integrationPlatformFinding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, id: { in: ['ipf_old'] } },
      }),
    );
  });

  it('updates findings seen before instead of duplicating them', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([]);
    await importer.import({
      organizationId: ORG,
      source: 'pentest',
      csv,
      resolveMissing: false,
    });
    const ids = mockDb.integrationPlatformFinding.create.mock.calls.map(
      ([arg]) => arg.data.externalId,
    );
    jest.clearAllMocks();
    mockDb.asset.findMany.mockResolvedValue([]);
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue(
      ids.map((externalId: string, i: number) => ({
        id: `ipf_${i}`,
        externalId,
        status: i === 0 ? 'resolved' : 'open',
      })),
    );
    const result = await importer.import({
      organizationId: ORG,
      source: 'pentest',
      csv,
      resolveMissing: false,
    });
    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      reopened: 1,
      resolved: 0,
    });
    expect(mockDb.integrationPlatformFinding.updateMany).not.toHaveBeenCalled();
  });

  it('turns a malformed file into a 400', async () => {
    await expect(
      importer.import({
        organizationId: ORG,
        source: 'asv_scan',
        csv: 'host\n1.1.1.1',
        resolveMissing: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
