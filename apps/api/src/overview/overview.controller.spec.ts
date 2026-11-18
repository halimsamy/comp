const mockDb = {
  frameworkInstance: { findMany: jest.fn() },
  complianceSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
  task: { findMany: jest.fn() },
  requirementMap: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@trycompai/integration-platform', () => ({
  getActiveManifests: () => [],
}));
jest.mock('../frameworks/scoring/framework-scoring.loader', () => ({
  loadFrameworkScores: jest.fn(),
}));
jest.mock('./overview-data', () => ({
  ...jest.requireActual('./overview-data'),
  loadOverviewData: jest.fn(),
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { loadFrameworkScores } from '../frameworks/scoring/framework-scoring.loader';
import {
  loadComplianceTrends,
  recordComplianceSnapshots,
} from './compliance-snapshots';
import { loadIntegrationCoverage } from './integration-coverage';
import { loadOverviewData } from './overview-data';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

const emptyData = {
  tasks: [],
  policies: [],
  members: [],
  trainingRecords: [],
  trainingModules: [],
  vendors: [],
  checkRuns: [],
  findings: [],
  accessReviews: [],
};

describe('OverviewController', () => {
  const controller = new OverviewController(new OverviewService());

  beforeEach(() => jest.clearAllMocks());

  it('requires app:read for the dashboard and integration:read for coverage', () => {
    const proto = OverviewController.prototype;
    for (const handler of [
      proto.getAttention,
      proto.getDeadlines,
      proto.getTrends,
    ]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        { resource: 'app', actions: ['read'] },
      ]);
    }
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, proto.getIntegrationCoverage),
    ).toEqual([{ resource: 'integration', actions: ['read'] }]);
  });

  it('loads data for the caller organization only', async () => {
    (loadOverviewData as jest.Mock).mockResolvedValue(emptyData);
    const attention = await controller.getAttention('org_1');
    expect(loadOverviewData).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(attention.data).toHaveLength(8);

    const deadlines = await controller.getDeadlines('org_1', { days: 14 });
    expect(deadlines).toMatchObject({
      windowDays: 14,
      overdue: [],
      dueSoon: [],
    });
  });
});

describe('compliance snapshots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts one row per framework instance for the UTC day', async () => {
    mockDb.frameworkInstance.findMany.mockResolvedValue([
      { id: 'fi_iso', framework: { name: 'ISO 27001' }, customFramework: null },
      { id: 'fi_pci', framework: { name: 'PCI DSS' }, customFramework: null },
    ]);
    (loadFrameworkScores as jest.Mock).mockResolvedValue(
      new Map([
        [
          'fi_iso',
          {
            complianceScore: 61.6,
            controlsComplete: 40,
            controlsTotal: 93,
            requirementsSatisfied: 50,
            requirementsTotal: 116,
          },
        ],
      ]),
    );
    const count = await recordComplianceSnapshots({
      organizationId: 'org_1',
      now: new Date('2026-11-18T23:30:00.000Z'),
    });

    expect(count).toBe(2);
    expect(mockDb.frameworkInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } }),
    );
    const first = mockDb.complianceSnapshot.upsert.mock.calls[0][0];
    expect(first.where.frameworkInstanceId_date.date.toISOString()).toBe(
      '2026-11-18T00:00:00.000Z',
    );
    expect(first.create).toMatchObject({
      organizationId: 'org_1',
      frameworkName: 'ISO 27001',
      scorePercent: 62,
      controlsTotal: 93,
    });
    // A framework without a score still gets a zero row, so gaps are visible.
    expect(
      mockDb.complianceSnapshot.upsert.mock.calls[1][0].create,
    ).toMatchObject({ scorePercent: 0 });
  });

  it('groups history per framework, oldest first, scoped to the org', async () => {
    mockDb.complianceSnapshot.findMany.mockResolvedValue([
      {
        frameworkInstanceId: 'fi_iso',
        frameworkName: 'ISO',
        date: new Date('2026-11-16'),
        scorePercent: 50,
        controlsComplete: 1,
        controlsTotal: 2,
      },
      {
        frameworkInstanceId: 'fi_iso',
        frameworkName: 'ISO 27001',
        date: new Date('2026-11-17'),
        scorePercent: 55,
        controlsComplete: 1,
        controlsTotal: 2,
      },
    ]);
    const result = await loadComplianceTrends({
      organizationId: 'org_1',
      days: 30,
      now: new Date('2026-11-18T10:00:00Z'),
    });

    expect(
      mockDb.complianceSnapshot.findMany.mock.calls[0][0].where.organizationId,
    ).toBe('org_1');
    expect(result.frameworks).toEqual([
      {
        frameworkInstanceId: 'fi_iso',
        frameworkName: 'ISO 27001',
        points: [
          {
            date: '2026-11-16',
            scorePercent: 50,
            controlsComplete: 1,
            controlsTotal: 2,
          },
          {
            date: '2026-11-17',
            scorePercent: 55,
            controlsComplete: 1,
            controlsTotal: 2,
          },
        ],
      },
    ]);
  });
});

describe('loadIntegrationCoverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts tasks and distinct requirements per framework for each provider', async () => {
    mockDb.task.findMany.mockResolvedValue([
      {
        status: 'todo',
        taskTemplateId: 'frk_tt_mfa',
        frameworkControlLinks: [
          { frameworkInstanceId: 'fi_iso', controlId: 'ctl_1' },
          { frameworkInstanceId: 'fi_pci', controlId: 'ctl_1' },
        ],
      },
      {
        status: 'done',
        taskTemplateId: 'frk_tt_access',
        frameworkControlLinks: [
          { frameworkInstanceId: 'fi_iso', controlId: 'ctl_2' },
        ],
      },
    ]);
    const iso = { framework: { name: 'ISO 27001' }, customFramework: null };
    const pci = { framework: { name: 'PCI DSS' }, customFramework: null };
    mockDb.requirementMap.findMany.mockResolvedValue([
      {
        frameworkInstanceId: 'fi_iso',
        controlId: 'ctl_1',
        requirementId: 'A.5.17',
        customRequirementId: null,
        frameworkInstance: iso,
      },
      {
        frameworkInstanceId: 'fi_iso',
        controlId: 'ctl_2',
        requirementId: 'A.5.17',
        customRequirementId: null,
        frameworkInstance: iso,
      },
      {
        frameworkInstanceId: 'fi_iso',
        controlId: 'ctl_2',
        requirementId: 'A.5.18',
        customRequirementId: null,
        frameworkInstance: iso,
      },
      {
        frameworkInstanceId: 'fi_pci',
        controlId: 'ctl_1',
        requirementId: '8.4.2',
        customRequirementId: null,
        frameworkInstance: pci,
      },
    ]);

    const result = await loadIntegrationCoverage({
      organizationId: 'org_1',
      manifests: [
        {
          id: 'gws',
          checks: [
            { taskMapping: 'frk_tt_mfa' },
            { taskMapping: 'frk_tt_access' },
          ],
        },
        { id: 'empty', checks: [{}] },
      ],
    });

    expect(mockDb.task.findMany.mock.calls[0][0].where.organizationId).toBe(
      'org_1',
    );
    expect(result).toEqual([
      {
        providerSlug: 'gws',
        tasks: 2,
        openTasks: 1,
        frameworks: [
          { name: 'ISO 27001', requirements: 2 },
          { name: 'PCI DSS', requirements: 1 },
        ],
      },
    ]);
  });
});
