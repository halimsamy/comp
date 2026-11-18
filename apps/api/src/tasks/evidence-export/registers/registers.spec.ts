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

describe('risk register', () => {
  const risk = {
    id: 'rsk_1',
    title: 'Card data leak',
    description: 'Leak',
    category: 'technology',
    department: 'it',
    status: 'open',
    likelihood: 'likely',
    impact: 'major',
    residualLikelihood: 'unlikely',
    residualImpact: 'minor',
    treatmentStrategy: 'mitigate',
    treatmentStrategyDescription: '=HYPERLINK("x")',
    createdAt: d('2026-01-01'),
    updatedAt: d('2026-02-01'),
    assignee: { user },
    tasks: [{ title: 'Encrypt PAN at rest', status: 'done' }],
  };

  it('scopes to the organization and rates inherent and residual risk', async () => {
    mockDb.risk.findMany.mockResolvedValue([{ ...risk, acceptances: [] }]);

    const [row] = parse(await REGISTERS.risks.build(ORG));

    expect(mockDb.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } }),
    );
    expect(row).toMatchObject({
      Title: 'Card data leak',
      Owner: 'Ada Lovelace',
      'Inherent score': '7',
      'Inherent level': 'High',
      'Residual score': '2',
      'Residual level': 'Very low',
      Acceptance: 'Not accepted',
      'Treatment tasks': 'Encrypt PAN at rest (Done)',
      Created: '2026-01-01',
      // Formula-leading cells are neutralized.
      'Treatment plan': `'=HYPERLINK(""x"")`,
    });
  });

  it('marks an acceptance stale once the residual rating changed', async () => {
    const acceptance = {
      createdAt: d('2026-03-01'),
      acceptedByName: 'CISO',
      notes: null,
      residualLikelihood: 'possible',
      residualImpact: 'minor',
    };
    mockDb.risk.findMany.mockResolvedValue([
      { ...risk, acceptances: [acceptance] },
    ]);

    const [row] = parse(await REGISTERS.risks.build(ORG));

    expect(row.Acceptance).toBe('Stale (residual rating changed)');
    expect(row['Accepted by']).toBe('CISO');
  });

  it('lists every acceptance event for risks and vendors', async () => {
    mockDb.riskAcceptance.findMany.mockResolvedValue([
      {
        id: 'rska_1',
        createdAt: d('2026-03-01'),
        acceptedByName: 'CISO',
        notes: 'ok',
        residualLikelihood: 'unlikely',
        residualImpact: 'minor',
        risk: {
          title: 'Card data leak',
          residualLikelihood: 'unlikely',
          residualImpact: 'minor',
        },
        vendor: null,
      },
      {
        id: 'rska_2',
        createdAt: d('2026-03-02'),
        acceptedByName: 'CTO',
        notes: null,
        residualLikelihood: 'unlikely',
        residualImpact: 'minor',
        risk: null,
        vendor: {
          name: 'AWS',
          residualProbability: 'likely',
          residualImpact: 'minor',
        },
      },
    ]);

    const rows = parse(await REGISTERS['risk-acceptances'].build(ORG));

    expect(
      rows.map((r) => [r['Subject type'], r.Subject, r['Still current']]),
    ).toEqual([
      ['Risk', 'Card data leak', 'Yes'],
      ['Vendor', 'AWS', 'No'],
    ]);
  });
});

describe('vendor register', () => {
  it('includes contacts, ratings and sub-processor flag', async () => {
    mockDb.vendor.findMany.mockResolvedValue([
      {
        id: 'vnd_1',
        name: 'AWS',
        description: 'Cloud',
        category: 'cloud',
        status: 'assessed',
        website: 'https://aws.amazon.com',
        isSubProcessor: true,
        assignee: null,
        contacts: [{ name: 'Rep', email: 'rep@aws.test' }],
        complianceBadges: [{ type: 'pci_dss', verified: true }, { type: 'soc2' }, 'junk'],
        inherentProbability: 'possible',
        inherentImpact: 'severe',
        residualProbability: 'unlikely',
        residualImpact: 'moderate',
        treatmentStrategy: 'transfer',
        treatmentStrategyDescription: null,
        acceptances: [],
        createdAt: d('2026-01-01'),
        updatedAt: d('2026-01-02'),
      },
    ]);

    const [row] = parse(await REGISTERS.vendors.build(ORG));

    expect(row).toMatchObject({
      Name: 'AWS',
      'Assessment status': 'Assessed',
      'Sub-processor': 'Yes',
      Contacts: 'Rep <rep@aws.test>',
      'Compliance attestations': 'PCI_DSS (verified); SOC2',
      'Inherent level': 'Medium',
      Treatment: 'Transfer',
    });
  });
});

describe('people population', () => {
  it('reports sign-off, training, background check and devices per member', async () => {
    const base = {
      role: 'employee',
      department: 'it',
      jobTitle: 'Engineer',
      deactivated: false,
      backgroundCheckExempt: false,
      backgroundCheckExemptReason: null,
      createdAt: d('2025-12-01'),
      onboardDate: d('2026-01-05'),
      offboardDate: null,
    };
    mockDb.member.findMany.mockResolvedValue([
      {
        ...base,
        id: 'mem_1',
        user,
        employeeTrainingVideoCompletion: [
          { videoId: 'sat-1', completedAt: d('2026-01-06') },
          { videoId: 'sat-2', completedAt: d('2026-01-07') },
        ],
      },
      {
        ...base,
        id: 'mem_2',
        user: { name: null, email: 'bob@spare.test' },
        deactivated: true,
        offboardDate: d('2026-04-01'),
        backgroundCheckExempt: true,
        backgroundCheckExemptReason: 'Contractor',
        employeeTrainingVideoCompletion: [
          { videoId: 'sat-1', completedAt: d('2026-01-06') },
        ],
      },
    ]);
    mockDb.policy.findMany.mockResolvedValue([
      { name: 'Acceptable Use', signedBy: ['mem_1', 'mem_2'] },
      { name: 'Access Control', signedBy: ['mem_1'] },
    ]);
    mockDb.device.findMany.mockResolvedValue([
      { memberId: 'mem_1', isCompliant: true },
      { memberId: 'mem_1', isCompliant: false },
    ]);
    // Oldest first (as queried): the latest check wins.
    mockDb.backgroundCheckRequest.findMany.mockResolvedValue([
      { memberId: 'mem_1', status: 'pending', updatedAt: d('2026-01-02') },
      {
        memberId: 'mem_1',
        status: 'completed_with_flags',
        updatedAt: d('2026-01-10'),
      },
    ]);
    mockFilterCompliance.mockImplementation(
      async (members: Array<{ id: string }>) =>
        members.filter((m) => m.id === 'mem_1'),
    );

    const [ada, bob] = parse(await REGISTERS.people.build(ORG));

    expect(ada).toMatchObject({
      Status: 'Active',
      'In compliance scope': 'Yes',
      Joined: '2026-01-05',
      Left: '',
      'Required policies signed': '2/2',
      'Security training completed': '2/2',
      'Training completed on': '2026-01-07',
      'Background check': 'Completed with flags',
      Devices: '2',
      'Compliant devices': '1',
    });
    expect(bob).toMatchObject({
      Name: '',
      Status: 'Offboarded',
      'In compliance scope': 'No',
      Left: '2026-04-01',
      'Required policies signed': '1/2',
      'Unsigned policies': 'Access Control',
      'Security training completed': '1/2',
      'Training completed on': '',
      'Background check': 'Exempt (Contractor)',
      Devices: '0',
    });
    expect(mockDb.backgroundCheckRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'asc' } }),
    );
  });
});
