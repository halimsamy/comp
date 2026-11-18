import { db } from '@db';
import { assetSyncSchedule } from './asset-sync-schedule';

const syncOrganization = jest.fn();

jest.mock('@db', () => ({ db: { organization: { findMany: jest.fn() } } }));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  schedules: { task: (config: unknown) => config },
}));
jest.mock('../../assets/asset-sync.service', () => ({
  AssetSyncService: jest.fn().mockImplementation(() => ({ syncOrganization })),
}));
jest.mock('../../integration-platform/services/check-results.service', () => ({
  CheckResultsService: jest.fn(),
}));
jest.mock(
  '../../integration-platform/repositories/check-run.repository',
  () => ({
    CheckRunRepository: jest.fn(),
  }),
);
jest.mock(
  '../../integration-platform/repositories/connection.repository',
  () => ({
    ConnectionRepository: jest.fn(),
  }),
);

const runSchedule = (
  assetSyncSchedule as unknown as {
    run: () => Promise<{ synced: number; failed: number }>;
  }
).run;

it('syncs each organization and keeps going when one fails', async () => {
  (db.organization.findMany as jest.Mock).mockResolvedValue([
    { id: 'org_1' },
    { id: 'org_2' },
  ]);
  syncOrganization
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce({ assets: 1 });

  await expect(runSchedule()).resolves.toEqual({ synced: 1, failed: 1 });
  expect(syncOrganization).toHaveBeenCalledWith('org_1');
  expect(syncOrganization).toHaveBeenCalledWith('org_2');
});
