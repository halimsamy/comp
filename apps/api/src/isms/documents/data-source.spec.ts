// Mock @db before importing the unit under test so collectPlatformData reads
// from these fakes. We only stub the table methods the function actually calls.
const mockDb = {
  organization: { findUnique: jest.fn() },
  frameworkInstance: { findMany: jest.fn() },
  vendor: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  device: { count: jest.fn() },
  risk: { findMany: jest.fn() },
  employeeTrainingVideoCompletion: { count: jest.fn() },
  frameworkEditorFramework: { findUnique: jest.fn() },
  ismsProfile: { findUnique: jest.fn() },
  ismsInterestedParty: { findMany: jest.fn() },
  riskAcceptance: { findMany: jest.fn() },
  ismsRoleAssignment: { findFirst: jest.fn() },
  organizationRole: { findMany: jest.fn() },
};

jest.mock('@db', () => ({ db: mockDb }));
// The real People filter runs; only the auth package (ESM-only deps) is stubbed.
jest.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_OBLIGATIONS: {
    owner: { compliance: true },
    admin: {},
    auditor: {},
    employee: { compliance: true },
    contractor: { compliance: true },
  },
  PLATFORM_ADMIN_ROLE: 'admin',
  allRoles: { owner: {}, admin: {}, auditor: {}, employee: {}, contractor: {} },
  isOrgParticipant: (role: string | null | undefined, ctx: { orgIsInternal: boolean }) =>
    ctx.orgIsInternal || role !== 'admin',
}));

import { collectPlatformData } from './data-source';

type VendorRow = {
  name: string;
  category: string;
  isSubProcessor: boolean;
  archivedAt?: Date | null;
};
type MemberRow = {
  role: string;
  department: string;
  deactivated: boolean;
  offboardDate: Date | null;
  user: { role: string | null };
};

const member = (overrides: Partial<MemberRow> = {}): MemberRow => ({
  role: 'employee',
  department: 'it',
  deactivated: false,
  offboardDate: null,
  user: { role: 'user' },
  ...overrides,
});
type RiskRow = { residualLikelihood: string; residualImpact: string };
type PartyRow = { id: string; name: string; category: string };

const ARGS = { organizationId: 'org_1', frameworkId: 'fw_1' };

function seedDb({
  vendors = [],
  members = [],
  risks = [],
  parties = [],
  deputyHolder = null,
  deviceCount = 0,
  trainingCount = 0,
}: {
  vendors?: VendorRow[];
  members?: MemberRow[];
  risks?: RiskRow[];
  parties?: PartyRow[];
  deputyHolder?: { memberId: string } | null;
  deviceCount?: number;
  trainingCount?: number;
}) {
  mockDb.organization.findUnique.mockResolvedValue({ name: '  Acme Corp  ' });
  mockDb.frameworkInstance.findMany.mockResolvedValue([
    { framework: { name: 'SOC 2' } },
  ]);
  mockDb.vendor.findMany.mockResolvedValue(vendors);
  mockDb.member.findMany.mockResolvedValue(members);
  mockDb.ismsRoleAssignment.findFirst.mockResolvedValue(deputyHolder);
  mockDb.organizationRole.findMany.mockResolvedValue([]);
  mockDb.device.count.mockResolvedValue(deviceCount);
  mockDb.risk.findMany.mockResolvedValue(risks);
  mockDb.employeeTrainingVideoCompletion.count.mockResolvedValue(trainingCount);
  mockDb.frameworkEditorFramework.findUnique.mockResolvedValue({
    name: 'ISO 27001',
  });
  mockDb.ismsProfile.findUnique.mockResolvedValue({ answers: {} });
  mockDb.ismsInterestedParty.findMany.mockResolvedValue(parties);
  mockDb.riskAcceptance.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('collectPlatformData', () => {
  it('counts only high-likelihood AND high-impact risks as high risk', async () => {
    seedDb({
      risks: [
        { residualLikelihood: 'likely', residualImpact: 'major' }, // high+high -> counts
        { residualLikelihood: 'very_likely', residualImpact: 'severe' }, // counts
        { residualLikelihood: 'very_likely', residualImpact: 'minor' }, // high likelihood only
        { residualLikelihood: 'unlikely', residualImpact: 'severe' }, // high impact only
        { residualLikelihood: 'unlikely', residualImpact: 'minor' }, // neither
      ],
    });

    const data = await collectPlatformData(ARGS);

    expect(data.riskCount).toBe(5);
    expect(data.highRiskCount).toBe(2);
  });

  it('groups vendors by category and tracks sub-processors and infra vendors', async () => {
    seedDb({
      vendors: [
        { name: 'AWS', category: 'cloud', isSubProcessor: true },
        { name: 'GCP', category: 'infrastructure', isSubProcessor: false },
        { name: 'Stripe', category: 'software_as_a_service', isSubProcessor: true },
        { name: 'Acme HR', category: 'hr', isSubProcessor: false },
      ],
    });

    const data = await collectPlatformData(ARGS);

    expect(data.vendorCount).toBe(4);
    expect(data.vendorsByCategory).toEqual({
      cloud: 1,
      infrastructure: 1,
      software_as_a_service: 1,
      hr: 1,
    });
    // sub-processors are AWS + Stripe, returned sorted.
    expect(data.subProcessorCount).toBe(2);
    expect(data.subProcessorNames).toEqual(['AWS', 'Stripe']);
    // infra/cloud categories only (not the hr vendor), sorted.
    expect(data.infraVendorNames).toEqual(['AWS', 'GCP', 'Stripe']);
  });

  it('groups current members by department', async () => {
    seedDb({
      members: [member(), member(), member(), member({ department: 'hr' }), member({ department: 'hr' })],
    });

    const data = await collectPlatformData(ARGS);

    expect(data.memberCount).toBe(5);
    expect(data.membersByDepartment).toEqual({ it: 3, hr: 2 });
  });

  it('counts members the way People does: no offboarded members or platform admins', async () => {
    seedDb({
      members: [
        member(),
        member({ role: 'owner', department: 'gov' }),
        member({ offboardDate: new Date('2020-01-01') }), // left already
        member({ offboardDate: new Date('2999-01-01') }), // leaving later: still current
        member({ user: { role: 'admin' } }), // platform admin debugging the org
        member({ role: 'auditor' }), // no compliance obligation
      ],
    });
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme', isInternal: false });

    const data = await collectPlatformData(ARGS);

    expect(data.memberCount).toBe(3);
    expect(data.membersByDepartment).toEqual({ it: 2, gov: 1 });
  });

  it('leaves archived vendors out of the counts but keeps them in the 6.1.3 fingerprint', async () => {
    const live = { name: 'AWS', category: 'cloud', isSubProcessor: true };
    const archived = { name: 'Old CRM', category: 'cloud', isSubProcessor: true, archivedAt: new Date() };
    seedDb({ vendors: [live, archived] });
    const withArchived = await collectPlatformData(ARGS);
    seedDb({ vendors: [live] });
    const withoutArchived = await collectPlatformData(ARGS);

    expect(withArchived.vendorCount).toBe(1);
    expect(withArchived.subProcessorNames).toEqual(['AWS']);
    expect(withArchived.infraVendorNames).toEqual(['AWS']);
    expect(withArchived.riskTreatmentFingerprint).not.toBe(withoutArchived.riskTreatmentFingerprint);
  });

  it('takes the Deputy SPO from the 5.3 Roles holder over the legacy wizard answer', async () => {
    seedDb({ deputyHolder: { memberId: 'mem_53' } });
    mockDb.ismsProfile.findUnique.mockResolvedValue({
      answers: { deputySpo: { memberId: 'mem_wizard', toBeNamed: false } },
    });

    const data = await collectPlatformData(ARGS);

    expect(data.wizardAnswers.deputySpo).toEqual({ memberId: 'mem_53' });
    expect(mockDb.ismsRoleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: {
            roleKey: 'deputy_spo',
            document: { organizationId: 'org_1', frameworkId: 'fw_1', type: 'roles_and_responsibilities' },
          },
        },
      }),
    );
  });

  it('falls back to the legacy wizard Deputy SPO when 5.3 has no holder', async () => {
    seedDb({});
    mockDb.ismsProfile.findUnique.mockResolvedValue({
      answers: { deputySpo: { memberId: null, toBeNamed: true } },
    });

    const data = await collectPlatformData(ARGS);

    expect(data.wizardAnswers.deputySpo).toEqual({ memberId: null, toBeNamed: true });
  });

  it('merges framework instance names with the requested framework, sorted', async () => {
    seedDb({});

    const data = await collectPlatformData(ARGS);

    // SOC 2 (instance) + ISO 27001 (ownFramework), de-duped and sorted.
    expect(data.frameworkNames).toEqual(['ISO 27001', 'SOC 2']);
  });

  it('trims the organization name and flags the training program', async () => {
    seedDb({ trainingCount: 4 });

    const data = await collectPlatformData(ARGS);

    expect(data.organizationName).toBe('Acme Corp');
    expect(data.hasTrainingProgram).toBe(true);
  });

  it('falls back to a default org name and no training when empty', async () => {
    seedDb({ trainingCount: 0 });
    mockDb.organization.findUnique.mockResolvedValue({ name: '   ' });

    const data = await collectPlatformData(ARGS);

    expect(data.organizationName).toBe('The organization');
    expect(data.hasTrainingProgram).toBe(false);
  });

  it('produces an order-insensitive parties fingerprint', async () => {
    const partiesA: PartyRow[] = [
      { id: 'p1', name: 'Customers', category: 'external' },
      { id: 'p2', name: 'Regulators', category: 'external' },
    ];
    const partiesReordered: PartyRow[] = [partiesA[1], partiesA[0]];

    seedDb({ parties: partiesA });
    const a = await collectPlatformData(ARGS);

    seedDb({ parties: partiesReordered });
    const b = await collectPlatformData(ARGS);

    expect(a.partiesFingerprint).toEqual(b.partiesFingerprint);
    expect(a.partiesFingerprint).not.toBe('');
  });

  it('changes the fingerprint when a party is edited', async () => {
    const original: PartyRow[] = [
      { id: 'p1', name: 'Customers', category: 'external' },
    ];
    const edited: PartyRow[] = [
      { id: 'p1', name: 'Customers (key accounts)', category: 'external' },
    ];

    seedDb({ parties: original });
    const before = await collectPlatformData(ARGS);

    seedDb({ parties: edited });
    const after = await collectPlatformData(ARGS);

    expect(after.partiesFingerprint).not.toBe(before.partiesFingerprint);
  });

  it('returns an empty fingerprint when no parties exist', async () => {
    seedDb({ parties: [] });

    const data = await collectPlatformData(ARGS);

    expect(data.partiesFingerprint).toBe('');
  });
});
