import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { AssetImportService } from './asset-import.service';

jest.mock('@db', () => {
  const asset = {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  return {
    db: {
      asset,
      evidenceSubmission: { findFirst: jest.fn() },
      member: { findMany: jest.fn() },
      vendor: { findMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ asset })),
    },
  };
});

const mockDb = db as unknown as {
  asset: Record<'findMany' | 'count' | 'create' | 'update', jest.Mock>;
  evidenceSubmission: { findFirst: jest.Mock };
  member: { findMany: jest.Mock };
  vendor: { findMany: jest.Mock };
};

const ORG = 'org_1';
const submission = {
  id: 'evs_1',
  submittedAt: new Date('2026-11-11'),
  data: {
    inventoryRows: [
      {
        assetId: '001',
        systemType: 'VPC spare-prod 10.40.0.0/16: subnets',
        environment: 'Production',
        location: 'AWS eu-central-1',
        assignedOwner: 'Engineering - Jane Doe',
        lastReviewed: '2026-11-11',
      },
      {
        assetId: '029',
        systemType: 'Vercel: hosting',
        environment: 'Production',
        assignedOwner: 'Nobody',
        lastReviewed: '2026-11-11',
      },
    ],
  },
};

describe('AssetImportService', () => {
  const service = new AssetImportService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.evidenceSubmission.findFirst.mockResolvedValue(submission);
    mockDb.member.findMany.mockResolvedValue([
      { id: 'mem_jane', user: { name: 'Jane Doe', email: 'jane@x.com' } },
    ]);
    mockDb.vendor.findMany.mockResolvedValue([
      { id: 'vnd_vercel', name: 'Vercel' },
    ]);
  });

  it('reads the latest non-rejected submission of the organization', async () => {
    mockDb.asset.findMany.mockResolvedValue([]);
    await service.importFromForm(ORG);
    expect(mockDb.evidenceSubmission.findFirst.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: ORG,
        formType: 'infrastructure_inventory',
        status: { not: 'rejected' },
      },
      orderBy: { submittedAt: 'desc' },
    });
  });

  it('creates one manual asset per row on the first import', async () => {
    mockDb.asset.findMany.mockResolvedValue([]);
    await expect(service.importFromForm(ORG)).resolves.toEqual({
      created: 2,
      updated: 0,
      total: 2,
    });
    const created = mockDb.asset.create.mock.calls.map(([arg]) => arg.data);
    expect(created[0]).toMatchObject({
      organizationId: ORG,
      source: 'manual',
      externalId: 'infra-form:001',
      name: 'VPC spare-prod 10.40.0.0/16',
      ownerId: 'mem_jane',
    });
    expect(created[1]).toMatchObject({ vendorId: 'vnd_vercel', ownerId: null });
  });

  it('is idempotent: a second import updates the same assets and keeps people-set owners', async () => {
    mockDb.asset.findMany.mockResolvedValue([
      {
        id: 'ast_1',
        externalId: 'infra-form:001',
        ownerId: 'mem_other',
        vendorId: null,
      },
      {
        id: 'ast_2',
        externalId: 'infra-form:029',
        ownerId: null,
        vendorId: null,
      },
    ]);
    await expect(service.importFromForm(ORG)).resolves.toEqual({
      created: 0,
      updated: 2,
      total: 2,
    });
    expect(mockDb.asset.create).not.toHaveBeenCalled();
    const [first, second] = mockDb.asset.update.mock.calls.map(([arg]) => arg);
    expect(first.where).toEqual({ id: 'ast_1', organizationId: ORG });
    expect(first.data).toMatchObject({
      ownerId: 'mem_other',
      archivedAt: null,
    });
    expect(second.data).toMatchObject({ vendorId: 'vnd_vercel' });
    expect(mockDb.asset.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      source: 'manual',
    });
  });

  it('previews the row count and how many were imported already', async () => {
    mockDb.asset.count.mockResolvedValue(2);
    await expect(service.formPreview(ORG)).resolves.toMatchObject({
      rows: 2,
      imported: 2,
    });
    mockDb.evidenceSubmission.findFirst.mockResolvedValue(null);
    await expect(service.formPreview(ORG)).resolves.toBeNull();
  });

  it('rejects an import without a submission or a CSV without a name column', async () => {
    mockDb.evidenceSubmission.findFirst.mockResolvedValue(null);
    await expect(service.importFromForm(ORG)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.importCsv({ organizationId: ORG, csv: 'type\nnetwork' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
