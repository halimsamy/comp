import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  organizationChart: { findUnique: jest.fn() },
  organizationChartSnapshot: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

import { OrgChartSnapshotsService } from './org-chart-snapshots.service';
import { OrgChartSnapshotsController } from './org-chart-snapshots.controller';
import { PERMISSIONS_KEY } from '../auth/permission.guard';

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));

describe('OrgChartSnapshotsService', () => {
  const service = new OrgChartSnapshotsService();
  beforeEach(() => jest.clearAllMocks());

  it('copies the current interactive chart with a dated default name', async () => {
    mockDb.organizationChart.findUnique.mockResolvedValue({
      type: 'interactive',
      nodes: [{ id: 'n1' }],
      edges: [],
    });
    mockDb.organizationChartSnapshot.create.mockImplementation(({ data }) => data);

    const snapshot = await service.create({ organizationId: 'org_1', createdById: 'usr_1' });

    expect(snapshot).toMatchObject({ organizationId: 'org_1', nodes: [{ id: 'n1' }], createdById: 'usr_1' });
    expect(snapshot.name).toMatch(/^Org chart \d{4}-\d{2}-\d{2}$/);
  });

  it('refuses to snapshot an empty or uploaded chart', async () => {
    mockDb.organizationChart.findUnique.mockResolvedValue({ type: 'uploaded', nodes: [], edges: [] });
    await expect(service.create({ organizationId: 'org_1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only returns snapshots of the caller organization', async () => {
    mockDb.organizationChartSnapshot.findFirst.mockResolvedValue(null);
    await expect(service.get({ organizationId: 'org_2', snapshotId: 'ocs_1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockDb.organizationChartSnapshot.findFirst).toHaveBeenCalledWith({
      where: { id: 'ocs_1', organizationId: 'org_2' },
    });
  });

  it('lists snapshots with node counts', async () => {
    mockDb.organizationChartSnapshot.findMany.mockResolvedValue([
      { id: 'ocs_1', name: 'A', createdAt: new Date(), createdById: null, nodes: [{}, {}] },
    ]);
    const [row] = await service.list('org_1');
    expect(row).toMatchObject({ id: 'ocs_1', nodeCount: 2 });
    expect(row).not.toHaveProperty('nodes');
  });

  it('gates reads with organization:read and saves with organization:update', () => {
    const proto = OrgChartSnapshotsController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.list)).toEqual([{ resource: 'organization', actions: ['read'] }]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.get)).toEqual([{ resource: 'organization', actions: ['read'] }]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.create)).toEqual([{ resource: 'organization', actions: ['update'] }]);
  });
});
