const mockDb = {
  member: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  policy: { findMany: jest.fn() },
  employeeTrainingVideoCompletion: { findMany: jest.fn() },
  device: { findMany: jest.fn() },
  frameworkInstance: { findFirst: jest.fn() },
  trainingModule: { findMany: jest.fn() },
  trainingCompletionRecord: { findMany: jest.fn() },
  offboardingChecklistTemplate: { findMany: jest.fn() },
  offboardingChecklistCompletion: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/company', () => ({
  GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'],
  HIPAA_TRAINING_ID: 'hipaa-sat-1',
  hipaaFrameworkInstanceWhere: (organizationId: string) => ({ organizationId }),
}));
jest.mock('../offboarding-checklist/offboarding-checklist.service', () => ({
  OffboardingChecklistService: class {},
}));
jest.mock('../offboarding-checklist/member-checklist', () => ({ seedChecklistDefaults: jest.fn() }));
// Auditors have no compliance obligation; everyone else does.
jest.mock('../utils/compliance-filters', () => ({
  filterComplianceMembers: async (members: { role: string }[]) => members.filter((m) => m.role !== 'auditor'),
}));

import { MemberComplianceService } from './member-compliance.service';

const NOW = new Date('2026-11-18T00:00:00Z');
const START = new Date('2026-10-01T00:00:00Z');

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_1',
    role: 'employee',
    department: 'it',
    createdAt: START,
    onboardDate: START,
    offboardDate: null,
    deactivated: false,
    fleetDmLabelId: null,
    backgroundCheckExempt: false,
    backgroundCheckExemptReason: null,
    user: { name: 'Ada', email: 'ada@example.com', role: 'user' },
    backgroundCheckRequests: [{ status: 'completed', completedAt: new Date('2026-09-20') }],
    ...overrides,
  };
}

function template(fields: Record<string, unknown>) {
  return { completed: false, completion: null, dueDays: null, autoCompleteSource: null, ...fields };
}

describe('MemberComplianceService', () => {
  const checklistService = { getMemberChecklist: jest.fn() };
  const service = new MemberComplianceService(checklistService as never);
  // trainingCompletionRecord.findMany serves both module records and lapsed cycles.
  let moduleRecords: unknown[] = [];
  let expiredCycles: unknown[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    moduleRecords = [];
    expiredCycles = [];
    mockDb.member.findMany.mockResolvedValue([memberRow()]);
    mockDb.organization.findUnique.mockResolvedValue({
      securityTrainingStepEnabled: true,
      deviceAgentStepEnabled: true,
      backgroundCheckStepEnabled: true,
    });
    mockDb.policy.findMany.mockResolvedValue([
      { id: 'pol_1', name: 'Acceptable use', signedBy: ['mem_1'], visibility: 'ALL', visibleToDepartments: [] },
      { id: 'pol_2', name: 'Access control', signedBy: [], visibility: 'ALL', visibleToDepartments: [] },
      { id: 'pol_3', name: 'HR only', signedBy: [], visibility: 'DEPARTMENT', visibleToDepartments: ['hr'] },
    ]);
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { memberId: 'mem_1', videoId: 'sat-1', completedAt: new Date('2026-10-02') },
      { memberId: 'mem_1', videoId: 'sat-2', completedAt: new Date('2026-10-03') },
    ]);
    mockDb.device.findMany.mockResolvedValue([{ memberId: 'mem_1', name: 'MacBook', isCompliant: true }]);
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);
    mockDb.trainingModule.findMany.mockResolvedValue([]);
    mockDb.trainingCompletionRecord.findMany.mockImplementation(
      (args: { distinct?: string[] }) => Promise.resolve(args.distinct ? expiredCycles : moduleRecords),
    );
    mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue([]);
    mockDb.offboardingChecklistCompletion.findMany.mockResolvedValue([]);
  });

  it('auto-completes onboarding items from native state and flags overdue SLAs', async () => {
    checklistService.getMemberChecklist.mockResolvedValue({
      items: [
        template({ title: 'Policies', autoCompleteSource: 'policies', dueDays: 30 }),
        template({ title: 'Training', autoCompleteSource: 'training', dueDays: 30 }),
        template({ title: 'Device', autoCompleteSource: 'device' }),
        template({ title: 'Background', autoCompleteSource: 'background_check' }),
        template({ title: 'NDA', dueDays: 0 }),
        template({ title: 'Contract', dueDays: 90 }),
      ],
    });

    const result = await service.getChecklist({
      organizationId: 'org_1',
      memberId: 'mem_1',
      kind: 'onboarding',
      now: NOW,
    });

    const byTitle = Object.fromEntries(result.items.map((i) => [i.title, i]));
    expect(byTitle.Policies).toMatchObject({ completed: false, overdue: true });
    expect(byTitle.Training).toMatchObject({ completed: true, completedAutomatically: true });
    expect(byTitle.Training.completedAt).toEqual(new Date('2026-10-03'));
    expect(byTitle.Device.completed).toBe(true);
    expect(byTitle.Background.completedAt).toEqual(new Date('2026-09-20'));
    expect(byTitle.NDA).toMatchObject({ completed: false, overdue: true });
    expect(byTitle.Contract).toMatchObject({ overdue: false });
    expect(result).toMatchObject({ completedItems: 3, overdueItems: 2, totalItems: 6 });
    expect(checklistService.getMemberChecklist).toHaveBeenCalledWith('org_1', 'mem_1', 'onboarding');
  });

  it('builds the per-person checklist with exemptions and role training', async () => {
    mockDb.member.findMany.mockResolvedValue([
      memberRow({
        backgroundCheckExempt: true,
        backgroundCheckExemptReason: 'Contractor via agency',
        backgroundCheckRequests: [],
      }),
    ]);
    mockDb.trainingModule.findMany.mockResolvedValue([
      {
        id: 'trm_1',
        title: 'Secure coding',
        frameworkReference: 'PCI DSS 6.2.2',
        targetRoles: [],
        targetDepartments: [],
        recurrenceMonths: 12,
      },
    ]);
    moduleRecords = [
      { memberId: 'mem_1', moduleId: 'trm_1', completedAt: new Date('2025-01-01'), expiresAt: new Date('2026-01-01') },
    ];
    checklistService.getMemberChecklist.mockResolvedValue({ items: [template({ completed: true })] });

    const result = await service.getCompliance({ organizationId: 'org_1', memberId: 'mem_1' });
    const byKey = Object.fromEntries(result.items.map((i) => [i.key, i]));

    expect(byKey.policies).toMatchObject({ status: 'incomplete', detail: '1 of 2 accepted' });
    expect(byKey.training.status).toBe('complete');
    // Renewal follows the oldest video, which the expiry job clears first.
    expect(byKey.training.expiresAt).toEqual(new Date('2027-10-02'));
    expect(byKey.role_training.status).toBe('expired');
    expect(byKey.device.status).toBe('complete');
    expect(byKey.background_check).toMatchObject({ status: 'not_required', detail: 'Exempt: Contractor via agency' });
    expect(byKey.onboarding.status).toBe('complete');
    expect(byKey.offboarding).toBeUndefined();
    expect(result.totalItems).toBe(5);
    expect(result.completedItems).toBe(3);
  });

  it('marks lapsed security awareness training as expired until it is retaken', async () => {
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { memberId: 'mem_1', videoId: 'sat-2', completedAt: new Date('2026-11-01') },
    ]);
    expiredCycles = [{ memberId: 'mem_1' }];
    checklistService.getMemberChecklist.mockResolvedValue({ items: [] });

    const result = await service.getCompliance({ organizationId: 'org_1', memberId: 'mem_1' });
    const training = result.items.find((i) => i.key === 'training');

    expect(training).toMatchObject({ status: 'expired', detail: '1 of 2 videos · 12-month renewal due' });
    const lapsedQuery = mockDb.trainingCompletionRecord.findMany.mock.calls.find((c) => c[0].distinct)?.[0];
    expect(lapsedQuery.where).toMatchObject({ organizationId: 'org_1', memberId: { in: ['mem_1'] } });
  });

  it('auto-completes the device item when the device step is turned off', async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      securityTrainingStepEnabled: true,
      deviceAgentStepEnabled: false,
      backgroundCheckStepEnabled: true,
    });
    mockDb.device.findMany.mockResolvedValue([]);
    checklistService.getMemberChecklist.mockResolvedValue({
      items: [template({ title: 'Device', autoCompleteSource: 'device', dueDays: 30 })],
    });
    const result = await service.getChecklist({
      organizationId: 'org_1',
      memberId: 'mem_1',
      kind: 'onboarding',
      now: NOW,
    });
    expect(result.items[0]).toMatchObject({ completed: true, overdue: false });
  });

  it('treats an item as due through the end of its due day', async () => {
    checklistService.getMemberChecklist.mockResolvedValue({
      items: [template({ title: 'NDA', dueDays: 0 })],
    });
    const sameDay = await service.getChecklist({
      organizationId: 'org_1',
      memberId: 'mem_1',
      kind: 'onboarding',
      now: new Date('2026-10-01T18:00:00Z'),
    });
    expect(sameDay.items[0].overdue).toBe(false);
  });

  it('scopes every query to the organization', async () => {
    mockDb.member.findMany.mockResolvedValue([]);
    await expect(service.getCompliance({ organizationId: 'org_2', memberId: 'mem_1' })).rejects.toThrow(
      'Member not found',
    );
    expect(mockDb.member.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_2', id: { in: ['mem_1'] } });
  });

  describe('organization compliance (GET /v1/people-lifecycle/compliance)', () => {
    const NOW_ORG = new Date('2026-11-18T00:00:00Z');

    it('returns one entry per obliged member with items and an overall status', async () => {
      mockDb.member.findMany.mockResolvedValue([
        memberRow(),
        memberRow({ id: 'mem_aud', role: 'auditor', user: { name: 'Aud', email: 'aud@x.com', role: 'user' } }),
      ]);
      mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue([
        { id: 'oct_nda', kind: 'onboarding', title: 'NDA', dueDays: null, autoCompleteSource: null, appliesToRoles: [], appliesToDepartments: [] },
      ]);
      mockDb.offboardingChecklistCompletion.findMany.mockResolvedValue([
        { memberId: 'mem_1', templateItemId: 'oct_nda', completedAt: new Date('2026-10-01') },
      ]);

      const result = await service.getOrgCompliance({ organizationId: 'org_1', now: NOW_ORG });

      expect(result).toHaveLength(1);
      expect(result[0].member).toMatchObject({ id: 'mem_1', email: 'ada@example.com', former: false });
      expect(result[0].pendingPolicies).toEqual([{ id: 'pol_2', name: 'Access control' }]);
      expect(result[0].items.map((i) => i.key)).toEqual([
        'policies',
        'training',
        'device',
        'background_check',
        'onboarding',
      ]);
      expect(result[0].overall).toBe('incomplete');
      // Every query is scoped to the organization.
      expect(mockDb.member.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1' });
      expect(mockDb.offboardingChecklistCompletion.findMany.mock.calls[0][0].where).toMatchObject({
        organizationId: 'org_1',
      });
    });

    it('keeps former members, with only their offboarding item', async () => {
      mockDb.member.findMany.mockResolvedValue([
        memberRow({ deactivated: true, offboardDate: new Date('2026-11-01') }),
      ]);
      mockDb.offboardingChecklistTemplate.findMany.mockResolvedValue([
        { id: 'oct_dev', kind: 'offboarding', title: 'Recover laptop', dueDays: null, autoCompleteSource: null, appliesToRoles: [], appliesToDepartments: [] },
      ]);
      const [entry] = await service.getOrgCompliance({ organizationId: 'org_1', now: NOW_ORG });
      expect(entry.member.former).toBe(true);
      expect(entry.items.map((i) => i.key)).toEqual(['offboarding']);
      expect(entry.pendingPolicies).toEqual([]);
    });
  });
});
