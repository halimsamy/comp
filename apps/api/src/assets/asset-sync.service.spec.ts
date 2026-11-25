import { db } from '@db';
import { AssetSyncService } from './asset-sync.service';
import type { CheckResultsService } from '../integration-platform/services/check-results.service';

jest.mock('@db', () => ({
  db: {
    asset: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    device: { findMany: jest.fn() },
    vulnerabilitySlaPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
    integrationPlatformFinding: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const mockDb = db as unknown as {
  asset: Record<'findMany' | 'createMany' | 'updateMany', jest.Mock>;
  device: { findMany: jest.Mock };
  integrationPlatformFinding: Record<
    'findMany' | 'create' | 'update' | 'updateMany',
    jest.Mock
  >;
};

const ORG = 'org_1';
const row = (over: Record<string, unknown>) => ({
  resultId: 'r',
  resourceId: 'x',
  resourceType: 'repository',
  passed: true,
  title: 't',
  description: null,
  severity: null,
  evidence: {},
  collectedAt: new Date(),
  runId: 'run',
  connectionId: 'icn_gh',
  ...over,
});

describe('AssetSyncService.syncOrganization', () => {
  const checkResults = {
    listRanChecks: jest.fn(),
    getLatestResultsByCheck: jest.fn(),
  };
  const service = new AssetSyncService(
    checkResults as unknown as CheckResultsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    checkResults.listRanChecks.mockResolvedValue([
      {
        connectionId: 'icn_gh',
        checkId: 'dependabot_enabled',
        providerSlug: 'github',
      },
    ]);
    checkResults.getLatestResultsByCheck.mockResolvedValue([
      row({
        resourceId: 'acme/api-prod',
        passed: false,
        severity: 'critical',
        title: '2 unresolved Dependabot alerts on api-prod',
      }),
      row({ resourceId: 'acme/web' }),
      row({ resourceId: 'admin@acme.com', resourceType: 'user' }),
    ]);
    mockDb.device.findMany.mockResolvedValue([
      { id: 'dev_1', name: 'MacBook', hostname: 'mbp', memberId: 'mem_1' },
    ]);
    mockDb.asset.findMany.mockImplementation(
      ({ where }: { where: { source?: string } }) => {
        if (where.source === 'integration') {
          return Promise.resolve([
            { id: 'ast_web', externalId: 'acme/web', archivedAt: new Date() },
            { id: 'ast_old', externalId: 'acme/old', archivedAt: null },
          ]);
        }
        if (where.source === 'device') return Promise.resolve([]);
        return Promise.resolve([
          { id: 'ast_api', externalId: 'acme/api-prod', ownerId: 'mem_9' },
        ]);
      },
    );
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([
      {
        id: 'ipf_gone',
        externalId: 'icn_gh:dependabot_enabled:acme/old',
        status: 'open',
      },
      {
        id: 'ipf_other',
        externalId: 'icn_aws:aws-security-scan:i-1',
        status: 'open',
      },
    ]);
  });

  it('creates new assets, revives seen ones, archives vanished ones and skips non-assets', async () => {
    const result = await service.syncOrganization(ORG);

    const created = mockDb.asset.createMany.mock.calls.flatMap(
      ([arg]) => arg.data,
    );
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: ORG,
          source: 'integration',
          externalId: 'acme/api-prod',
          name: 'api-prod',
          type: 'repository',
          environment: 'production',
          providerSlug: 'github',
        }),
        expect.objectContaining({
          source: 'device',
          externalId: 'dev_1',
          type: 'computer',
          ownerId: 'mem_1',
        }),
      ]),
    );
    expect(
      created.some(
        (a: { externalId: string }) => a.externalId === 'admin@acme.com',
      ),
    ).toBe(false);
    expect(mockDb.asset.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: ['ast_web'] } },
      data: expect.objectContaining({ archivedAt: null }),
    });
    expect(mockDb.asset.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: ['ast_old'] } },
      data: { archivedAt: expect.any(Date) },
    });
    expect(result).toEqual({ assets: 3, vulnerabilities: 1 });
  });

  it('opens a vulnerability with an SLA and the asset owner, and resolves only scanned ones that vanished', async () => {
    await service.syncOrganization(ORG);

    expect(mockDb.integrationPlatformFinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG,
        source: 'integration',
        externalId: 'icn_gh:dependabot_enabled:acme/api-prod',
        severity: 'critical',
        assetId: 'ast_api',
        ownerId: 'mem_9',
        slaDueAt: expect.any(Date),
      }),
    });
    expect(mockDb.integrationPlatformFinding.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: ['ipf_gone'] } },
      data: { status: 'resolved', resolvedAt: expect.any(Date) },
    });
  });

  it('reopens a resolved vulnerability with a fresh first-seen date', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([
      {
        id: 'ipf_1',
        externalId: 'icn_gh:dependabot_enabled:acme/api-prod',
        status: 'resolved',
      },
    ]);
    await service.syncOrganization(ORG);
    expect(mockDb.integrationPlatformFinding.update).toHaveBeenCalledWith({
      where: { id: 'ipf_1', organizationId: ORG },
      data: expect.objectContaining({
        status: 'open',
        resolvedAt: null,
        firstSeenAt: expect.any(Date),
      }),
    });
  });

  it('leaves a false positive marked as such', async () => {
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([
      {
        id: 'ipf_1',
        externalId: 'icn_gh:dependabot_enabled:acme/api-prod',
        status: 'false_positive',
      },
    ]);
    await service.syncOrganization(ORG);
    const data = mockDb.integrationPlatformFinding.update.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.lastSeenAt).toEqual(expect.any(Date));
  });
});
