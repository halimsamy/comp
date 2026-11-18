const mockDb = {
  member: { findFirst: jest.fn() },
  policy: { findMany: jest.fn() },
  employeeTrainingVideoCompletion: { findMany: jest.fn() },
  device: { findMany: jest.fn() },
  frameworkInstance: { findFirst: jest.fn() },
  trainingCompletionRecord: { findFirst: jest.fn() },
};
jest.mock('@db', () => ({
  db: mockDb,
  BackgroundCheckStatus: { completed: 'completed', completed_with_flags: 'completed_with_flags' },
}));
jest.mock('@trycompai/company', () => ({
  GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'],
  HIPAA_TRAINING_ID: 'hipaa-sat-1',
  hipaaFrameworkInstanceWhere: (organizationId: string) => ({ organizationId }),
}));
jest.mock('../offboarding-checklist/offboarding-checklist.service', () => ({
  OffboardingChecklistService: class {},
}));
jest.mock('../training/training-modules.service', () => ({ TrainingModulesService: class {} }));

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
    user: { name: 'Ada', email: 'ada@example.com' },
    organization: {
      securityTrainingStepEnabled: true,
      deviceAgentStepEnabled: true,
      backgroundCheckStepEnabled: true,
    },
    backgroundCheckRequests: [{ status: 'completed', completedAt: new Date('2026-09-20') }],
    ...overrides,
  };
}

function template(fields: Record<string, unknown>) {
  return { completed: false, completion: null, dueDays: null, autoCompleteSource: null, ...fields };
}

describe('MemberComplianceService', () => {
  const checklistService = { getMemberChecklist: jest.fn() };
  const modulesService = { getMemberModules: jest.fn() };
  const service = new MemberComplianceService(checklistService as never, modulesService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue(memberRow());
    mockDb.policy.findMany.mockResolvedValue([
      { id: 'pol_1', name: 'Acceptable use', signedBy: ['mem_1'] },
      { id: 'pol_2', name: 'Access control', signedBy: [] },
    ]);
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { videoId: 'sat-1', completedAt: new Date('2026-10-02') },
      { videoId: 'sat-2', completedAt: new Date('2026-10-03') },
    ]);
    mockDb.device.findMany.mockResolvedValue([{ name: 'MacBook', isCompliant: true }]);
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);
    modulesService.getMemberModules.mockResolvedValue([]);
    mockDb.trainingCompletionRecord.findFirst.mockResolvedValue(null);
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
    mockDb.member.findFirst.mockResolvedValue(
      memberRow({
        backgroundCheckExempt: true,
        backgroundCheckExemptReason: 'Contractor via agency',
        backgroundCheckRequests: [],
      }),
    );
    modulesService.getMemberModules.mockResolvedValue([
      { id: 'trm_1', title: 'Secure coding', frameworkReference: 'PCI DSS 6.2.2', status: 'expired', completedAt: null, expiresAt: null },
    ]);
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
      { videoId: 'sat-2', completedAt: new Date('2026-11-01') },
    ]);
    mockDb.trainingCompletionRecord.findFirst.mockResolvedValue({ id: 'tcr_1' });
    checklistService.getMemberChecklist.mockResolvedValue({ items: [] });

    const result = await service.getCompliance({ organizationId: 'org_1', memberId: 'mem_1' });
    const training = result.items.find((i) => i.key === 'training');

    expect(training).toMatchObject({ status: 'expired', detail: '1 of 2 videos · 12-month renewal due' });
    expect(mockDb.trainingCompletionRecord.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      memberId: 'mem_1',
    });
  });

  it('auto-completes the device item when the device step is turned off', async () => {
    mockDb.member.findFirst.mockResolvedValue(
      memberRow({
        organization: {
          securityTrainingStepEnabled: true,
          deviceAgentStepEnabled: false,
          backgroundCheckStepEnabled: true,
        },
      }),
    );
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
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(service.getCompliance({ organizationId: 'org_2', memberId: 'mem_1' })).rejects.toThrow(
      'Member not found',
    );
    expect(mockDb.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'mem_1', organizationId: 'org_2' });
  });
});
