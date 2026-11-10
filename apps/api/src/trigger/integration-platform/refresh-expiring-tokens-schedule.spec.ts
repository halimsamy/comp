import { db } from '@db';
import { requestValidCredentials } from './ensure-valid-credentials';
import { refreshExpiringTokensSchedule } from './refresh-expiring-tokens-schedule';

// The jobs mock below makes schedules.task return its config, so `run` is callable.
const runSchedule = (
  refreshExpiringTokensSchedule as unknown as {
    run: (payload: { timestamp: Date }) => Promise<{ refreshed: number }>;
  }
).run;

jest.mock('@db', () => ({
  db: {
    integrationConnection: { findMany: jest.fn() },
  },
}));

jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  schedules: {
    task: (config: unknown) => config,
  },
}));

jest.mock('./ensure-valid-credentials', () => ({
  requestValidCredentials: jest.fn(),
}));

describe('refreshExpiringTokensSchedule', () => {
  const nowMs = Date.parse('2026-04-24T00:00:00.000Z');
  const lookaheadMs = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    // The task reads `new Date()` too, so pin the system clock, not just Date.now.
    jest.useFakeTimers({ now: nowMs });
    process.env.API_URL = 'http://api.test';
    (requestValidCredentials as jest.Mock).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.API_URL;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('refreshes only connections whose latest credential version expires soon', async () => {
    const connectionWithOldVersionExpiringSoon = {
      id: 'conn_old_soon',
      providerSlug: 'example',
      organizationId: 'org_1',
      organization: { id: 'org_1', name: 'Org 1' },
      credentialVersions: [
        { expiresAt: new Date('2026-04-26T00:00:00.000Z') },
        { expiresAt: new Date('2026-04-24T12:00:00.000Z') },
      ],
    };

    const connectionWithLatestExpiringSoon = {
      id: 'conn_latest_soon',
      providerSlug: 'example',
      organizationId: 'org_2',
      organization: { id: 'org_2', name: 'Org 2' },
      credentialVersions: [{ expiresAt: new Date('2026-04-24T12:00:00.000Z') }],
    };

    (db.integrationConnection.findMany as jest.Mock).mockResolvedValue([
      connectionWithOldVersionExpiringSoon,
      connectionWithLatestExpiringSoon,
    ]);

    const result = await runSchedule({ timestamp: new Date(nowMs) });

    expect(result.refreshed).toBe(1);
    expect(requestValidCredentials).toHaveBeenCalledTimes(1);
    expect(requestValidCredentials).toHaveBeenCalledWith({
      apiUrl: expect.any(String),
      connectionId: 'conn_latest_soon',
      organizationId: 'org_2',
      forceRefresh: true,
    });
  });

  it('skips connections whose latest version is not expiring soon', async () => {
    const connectionLatestValid = {
      id: 'conn_latest_valid',
      providerSlug: 'example',
      organizationId: 'org_3',
      organization: { id: 'org_3', name: 'Org 3' },
      credentialVersions: [{ expiresAt: new Date('2026-04-25T12:00:00.000Z') }],
    };

    (db.integrationConnection.findMany as jest.Mock).mockResolvedValue([
      connectionLatestValid,
    ]);

    const result = await runSchedule({ timestamp: new Date(nowMs) });

    expect(result.refreshed).toBe(0);
    expect(requestValidCredentials).not.toHaveBeenCalled();
  });
});
