const mockDb = {
  risk: { findMany: jest.fn() },
  riskAcceptance: { findMany: jest.fn() },
  vendor: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  policy: { findMany: jest.fn() },
  device: { findMany: jest.fn() },
  backgroundCheckRequest: { findMany: jest.fn() },
  finding: { findMany: jest.fn() },
  offboardingChecklistTemplate: { count: jest.fn() },
  asset: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
const mockAckExport = jest.fn();
jest.mock('../../../policies/lifecycle/acknowledgement-export', () => ({
  exportAcknowledgementsCsv: (...args: unknown[]) => mockAckExport(...args),
}));
jest.mock('@trycompai/company', () => ({
  GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'],
}));
const mockFilterCompliance = jest.fn();
jest.mock('../../../utils/compliance-filters', () => ({
  filterComplianceMembers: (...args: unknown[]) =>
    mockFilterCompliance(...args),
}));

import { REGISTERS } from './registers';

const ORG = { organizationId: 'org_1' };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const user = { name: 'Ada Lovelace', email: 'ada@spare.test' };

function parse(csv: string): Array<Record<string, string>> {
  const [header, ...rows] = csv
    .split('\n')
    .map((line) => line.slice(1, -1).split('","'));
  return rows.map((row) =>
    Object.fromEntries(header.map((h, i) => [h, row[i]])),
  );
}

beforeEach(() => jest.clearAllMocks());

describe('device inventory and offboarding', () => {
  it('lists device posture', async () => {
    mockDb.device.findMany.mockResolvedValue([
      {
        id: 'dev_1',
        name: 'MacBook',
        hostname: 'ada-mbp',
        member: { user },
        platform: 'macos',
        osVersion: '15.1',
        serialNumber: 'C02',
        hardwareModel: 'M3',
        source: 'agent',
        isCompliant: true,
        diskEncryptionEnabled: true,
        antivirusEnabled: false,
        passwordPolicySet: true,
        screenLockEnabled: true,
        lastCheckIn: d('2026-11-01'),
        installedAt: d('2026-01-01'),
      },
    ]);

    const [row] = parse(await REGISTERS.devices.build(ORG));

    expect(row).toMatchObject({
      Owner: 'Ada Lovelace',
      Platform: 'Macos',
      Compliant: 'Yes',
      Antivirus: 'No',
      'Last check-in': '2026-11-01',
    });
  });

  it('shows who attested a manual device and when', async () => {
    const manual = { member: { user }, source: 'manual', attestedAt: d('2026-11-25') };
    mockDb.device.findMany.mockResolvedValue([
      { ...manual, id: 'dev_m1', attestedBy: { name: null, email: 'admin@spare.test' } },
      { ...manual, id: 'dev_m2', attestedBy: null },
      { id: 'dev_a', member: { user }, source: 'agent', attestedBy: null, attestedAt: null },
    ]);

    const rows = parse(await REGISTERS.devices.build(ORG));

    expect(mockDb.device.findMany.mock.calls[0][0].include.attestedBy).toEqual({
      select: { name: true, email: true },
    });
    expect(rows.map((r) => [r['Checks attested by'], r['Checks attested at']])).toEqual([
      ['admin@spare.test', '2026-11-25'],
      ['Not recorded', '2026-11-25'],
      ['', ''],
    ]);
  });

  it('summarizes each offboarding checklist and the vendor access revoked', async () => {
    mockDb.offboardingChecklistTemplate.count.mockResolvedValue(2);
    mockDb.member.findMany.mockResolvedValue([
      {
        id: 'mem_2',
        user,
        department: 'none',
        offboardDate: d('2026-04-01'),
        offboardingChecklistCompletions: [
          { completedAt: d('2026-04-01') },
          { completedAt: d('2026-04-03') },
        ],
        offboardingAccessRevocations: [{ vendor: { name: 'GitHub' } }],
      },
    ]);

    const [row] = parse(await REGISTERS.offboarding.build(ORG));

    expect(mockDb.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', offboardDate: { not: null } },
      }),
    );
    expect(row).toMatchObject({
      Department: '',
      'Checklist items completed': '2/2',
      'Checklist completed on': '2026-04-03',
      'Vendor access revoked': '1',
      Vendors: 'GitHub',
    });
  });
});

describe('asset inventory', () => {
  it('adds lifecycle, location, vendor, scope and review columns', async () => {
    mockDb.asset.findMany.mockResolvedValue([
      {
        id: 'ast_1',
        name: 'prod-db',
        type: 'database',
        source: 'manual',
        externalId: 'gen',
        providerSlug: null,
        environment: 'production',
        cdeScope: 'out_of_scope',
        dataClassification: 'confidential',
        owner: { user },
        description: null,
        version: 'PostgreSQL 16.4',
        endOfSupportAt: d('2028-11-09'),
        location: 'AWS eu-central-1',
        vendor: { name: 'AWS' },
        scopeJustification: 'Tokenized data only',
        lastReviewedAt: d('2026-11-20'),
        lastReviewedById: 'mem_9',
        _count: { vulnerabilities: 0 },
        firstSeenAt: d('2026-01-01'),
        lastSeenAt: d('2026-11-25'),
      },
    ]);
    mockDb.member.findMany.mockResolvedValue([
      { id: 'mem_9', user: { name: 'Grace Hopper', email: 'grace@spare.test' } },
    ]);

    const [row] = parse(await REGISTERS.assets.build(ORG));

    expect(mockDb.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', archivedAt: null } }),
    );
    expect(mockDb.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', id: { in: ['mem_9'] } } }),
    );
    expect(row).toMatchObject({
      Version: 'PostgreSQL 16.4',
      'End of support': '2028-11-09',
      Location: 'AWS eu-central-1',
      Vendor: 'AWS',
      'Scope justification': 'Tokenized data only',
      'Last reviewed': '2026-11-20',
      'Last reviewed by': 'Grace Hopper',
    });
  });
});

describe('policy acknowledgements', () => {
  it('reuses the per-person acknowledgement export, scoped to the organization', async () => {
    mockAckExport.mockResolvedValue({ csv: 'Policy,Person', count: 0, filename: 'x.csv' });

    const csv = await REGISTERS['policy-acknowledgements'].build(ORG);

    expect(mockAckExport).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(csv).toBe('Policy,Person');
    expect(REGISTERS['policy-acknowledgements'].resource).toBe('policy');
  });
});
