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
};
jest.mock('@db', () => ({ db: mockDb }));
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

describe('device inventory, findings and offboarding', () => {
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

  it('describes each finding by its subject', async () => {
    const none = {
      task: null,
      policy: null,
      vendor: null,
      risk: null,
      device: null,
      member: null,
    };
    mockDb.finding.findMany.mockResolvedValue([
      {
        ...none,
        id: 'fnd_1',
        type: 'iso27001',
        severity: 'high',
        status: 'open',
        policy: { name: 'Access Control' },
        content: 'Outdated',
        revisionNote: null,
        createdBy: { user },
        evidenceFormType: null,
        area: null,
        createdAt: d('2026-05-01'),
        updatedAt: d('2026-05-02'),
      },
      {
        ...none,
        id: 'fnd_2',
        type: 'pci_dss',
        severity: 'low',
        status: 'closed',
        content: 'No risks',
        revisionNote: null,
        createdBy: null,
        evidenceFormType: null,
        area: 'risks',
        createdAt: d('2026-05-01'),
        updatedAt: d('2026-05-02'),
      },
    ]);

    const rows = parse(await REGISTERS.findings.build(ORG));

    expect(
      rows.map((r) => [r['Subject type'], r.Subject, r.Framework]),
    ).toEqual([
      ['Policy', 'Access Control', 'Iso27001'],
      ['Area', 'Risks', 'Pci dss'],
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
