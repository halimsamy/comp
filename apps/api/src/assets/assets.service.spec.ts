import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { AssetsService } from './assets.service';

jest.mock('@db', () => ({
  db: {
    asset: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    member: { findFirst: jest.fn() },
  },
}));

const mockDb = db as unknown as {
  asset: Record<
    'findMany' | 'findFirst' | 'create' | 'update' | 'delete',
    jest.Mock
  >;
  member: { findFirst: jest.Mock };
};

const ORG = 'org_1';
const stored = {
  id: 'ast_1',
  name: 'Office firewall',
  type: 'network',
  source: 'manual',
  owner: { id: 'mem_1', user: { name: 'Ana', email: 'ana@x.com' } },
  _count: { vulnerabilities: 2 },
};

describe('AssetsService', () => {
  const service = new AssetsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1' });
    mockDb.asset.create.mockResolvedValue(stored);
    mockDb.asset.update.mockResolvedValue(stored);
  });

  it('lists active assets scoped to the organization and flattens owner + vuln count', async () => {
    mockDb.asset.findMany.mockResolvedValue([stored]);
    const [asset] = await service.list({
      organizationId: ORG,
      includeArchived: false,
    });
    expect(mockDb.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, archivedAt: null },
      }),
    );
    expect(asset.owner).toEqual({
      id: 'mem_1',
      name: 'Ana',
      email: 'ana@x.com',
    });
    expect(asset.openVulnerabilities).toBe(2);
  });

  it('includes archived assets on request', async () => {
    mockDb.asset.findMany.mockResolvedValue([]);
    await service.list({ organizationId: ORG, includeArchived: true });
    expect(mockDb.asset.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
    });
  });

  it('creates a manual asset with a validated owner', async () => {
    await service.create({
      organizationId: ORG,
      dto: {
        name: ' Office firewall ',
        type: 'network',
        cdeScope: 'connected',
        ownerId: 'mem_1',
      },
    });
    expect(mockDb.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_1', organizationId: ORG, deactivated: false },
      }),
    );
    expect(mockDb.asset.create.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      source: 'manual',
      name: 'Office firewall',
      cdeScope: 'connected',
      ownerId: 'mem_1',
    });
  });

  it('rejects an owner from another organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        organizationId: ORG,
        dto: { name: 'x', type: 'other', ownerId: 'mem_x' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates scope and clears the owner', async () => {
    mockDb.asset.findFirst.mockResolvedValue({
      id: 'ast_1',
      source: 'integration',
    });
    await service.update({
      organizationId: ORG,
      assetId: 'ast_1',
      dto: { cdeScope: 'in_scope', ownerId: null },
    });
    expect(mockDb.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ast_1', organizationId: ORG },
        data: expect.objectContaining({ cdeScope: 'in_scope', ownerId: null }),
      }),
    );
  });

  it('404s an asset outside the organization', async () => {
    mockDb.asset.findFirst.mockResolvedValue(null);
    await expect(
      service.update({ organizationId: ORG, assetId: 'ast_x', dto: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ast_x', organizationId: ORG } }),
    );
  });

  it('deletes manual assets only', async () => {
    mockDb.asset.findFirst.mockResolvedValueOnce({
      id: 'ast_1',
      source: 'manual',
    });
    await expect(
      service.remove({ organizationId: ORG, assetId: 'ast_1' }),
    ).resolves.toEqual({ id: 'ast_1' });
    mockDb.asset.findFirst.mockResolvedValueOnce({
      id: 'ast_2',
      source: 'integration',
    });
    await expect(
      service.remove({ organizationId: ORG, assetId: 'ast_2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.asset.delete).toHaveBeenCalledTimes(1);
  });
});
