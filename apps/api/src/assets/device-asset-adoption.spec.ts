import { db } from '@db';
import { adoptManualComputers } from './device-asset-adoption';

jest.mock('@db', () => ({
  db: { asset: { findMany: jest.fn(), update: jest.fn() } },
}));

const mockDb = db as unknown as {
  asset: { findMany: jest.Mock; update: jest.Mock };
};
const ORG = 'org_1';

describe('adoptManualComputers', () => {
  beforeEach(() => jest.clearAllMocks());

  const withAssets = ({
    linked,
    manual,
  }: {
    linked: string[];
    manual: { id: string; ownerId: string }[];
  }) =>
    mockDb.asset.findMany.mockImplementation(
      ({ where }: { where: { source: string } }) =>
        Promise.resolve(
          where.source === 'device'
            ? linked.map((externalId) => ({ externalId }))
            : manual,
        ),
    );

  it("links a new device to its owner's only hand-added computer", async () => {
    withAssets({ linked: [], manual: [{ id: 'ast_lap1', ownerId: 'mem_1' }] });
    await expect(
      adoptManualComputers({
        organizationId: ORG,
        devices: [{ id: 'dev_1', memberId: 'mem_1' }],
      }),
    ).resolves.toBe(1);
    expect(mockDb.asset.update).toHaveBeenCalledWith({
      where: { id: 'ast_lap1' },
      data: { source: 'device', externalId: 'dev_1', resourceType: 'device' },
    });
  });

  it('leaves ambiguous owners alone (two laptops or two new devices)', async () => {
    withAssets({
      linked: [],
      manual: [
        { id: 'ast_a', ownerId: 'mem_1' },
        { id: 'ast_b', ownerId: 'mem_1' },
        { id: 'ast_c', ownerId: 'mem_2' },
      ],
    });
    await expect(
      adoptManualComputers({
        organizationId: ORG,
        devices: [
          { id: 'dev_1', memberId: 'mem_1' },
          { id: 'dev_2', memberId: 'mem_2' },
          { id: 'dev_3', memberId: 'mem_2' },
        ],
      }),
    ).resolves.toBe(0);
    expect(mockDb.asset.update).not.toHaveBeenCalled();
  });

  it('skips devices that already have an asset', async () => {
    withAssets({ linked: ['dev_1'], manual: [] });
    await expect(
      adoptManualComputers({
        organizationId: ORG,
        devices: [{ id: 'dev_1', memberId: 'mem_1' }],
      }),
    ).resolves.toBe(0);
    expect(mockDb.asset.findMany).toHaveBeenCalledTimes(1);
  });
});
