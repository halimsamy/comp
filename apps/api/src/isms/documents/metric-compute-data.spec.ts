import { db } from '@db';
import { computePlatformMetrics } from './metric-compute-data';
import { trainingStatusForOrg } from '../../people-lifecycle/training-status';
import { IsmsNonconformityService } from '../isms-nonconformity.service';

jest.mock('@db', () => ({
  db: {
    member: { findMany: jest.fn() },
    policy: { findMany: jest.fn() },
    risk: { findMany: jest.fn().mockResolvedValue([]) },
    vendor: { findMany: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]) },
    integrationPlatformFinding: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('../../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(async (members: unknown[]) => members),
}));
jest.mock('../../assets/vulnerability-sla', () => ({
  loadSlaDays: jest.fn().mockResolvedValue({}),
  slaDueDate: jest.fn(),
}));
jest.mock('../../people-lifecycle/training-status', () => ({
  trainingStatusForOrg: jest.fn(),
}));
jest.mock('../isms-nonconformity.service', () => ({
  IsmsNonconformityService: jest.fn(),
}));

const mockDb = jest.mocked(db);
const now = new Date('2026-11-18T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('computePlatformMetrics reuses the module rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.member.findMany as jest.Mock).mockResolvedValue([
      { id: 'eng', role: 'employee', department: 'it', user: { role: 'user' } },
      { id: 'ops', role: 'employee', department: 'admin', user: { role: 'user' } },
    ]);
    (mockDb.policy.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'it-only',
        status: 'published',
        isRequiredToSign: true,
        signedBy: ['eng'],
        visibility: 'DEPARTMENT',
        visibleToDepartments: ['it'],
      },
    ]);
    (mockDb.vendor.findMany as jest.Mock).mockResolvedValue([
      // In scope by criticality, reviewed and in date.
      { criticality: 'high', handlesCardholderData: false, affectsCdeSecurity: false, inherentProbability: 'very_unlikely', inherentImpact: 'insignificant', lastReviewedAt: daysAgo(10), nextReviewDue: daysAgo(-200) },
      // In scope, overdue.
      { criticality: 'critical', handlesCardholderData: false, affectsCdeSecurity: false, inherentProbability: 'very_unlikely', inherentImpact: 'insignificant', lastReviewedAt: daysAgo(400), nextReviewDue: daysAgo(5) },
      // Out of review scope: low criticality, low risk.
      { criticality: 'low', handlesCardholderData: false, affectsCdeSecurity: false, inherentProbability: 'very_unlikely', inherentImpact: 'insignificant', lastReviewedAt: null, nextReviewDue: null },
    ]);
    jest.mocked(trainingStatusForOrg).mockResolvedValue({
      inScope: 3,
      trained: 1,
      expired: 1,
      neverTrained: 0,
      members: [
        { status: 'complete' },
        { status: 'expired' },
        { status: 'incomplete' },
        { status: 'not_required' },
      ],
    } as Awaited<ReturnType<typeof trainingStatusForOrg>>);
    const list = jest.fn().mockResolvedValue({
      data: [
        { status: 'open', createdAt: daysAgo(5), dueDate: null },
        { status: 'in_progress', createdAt: daysAgo(45), dueDate: daysAgo(1) },
        { status: 'closed', createdAt: daysAgo(100), dueDate: null },
      ],
      count: 3,
    });
    jest.mocked(IsmsNonconformityService).mockImplementation(
      () => ({ list }) as unknown as IsmsNonconformityService,
    );
  });

  it('counts a department-visibility policy only for that department (Overview rule)', async () => {
    const values = await computePlatformMetrics({ organizationId: 'org_1', now });
    expect(values.policy_acknowledgement.value).toBe('100%');
    expect(values.policy_acknowledgement.note).toContain('1 of 1');
  });

  it('counts expired training as not complete (trainingStatusForOrg)', async () => {
    const values = await computePlatformMetrics({ organizationId: 'org_1', now });
    expect(trainingStatusForOrg).toHaveBeenCalledWith('org_1', now);
    expect(values.training_completion.value).toBe('33.3%');
  });

  it('measures vendors in review scope only and never loads archived ones', async () => {
    const values = await computePlatformMetrics({ organizationId: 'org_1', now });
    expect(mockDb.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', archivedAt: null } }),
    );
    expect(values.vendor_review_currency.value).toBe('50%');
  });

  it('ages the open rows of the 10.2 register (no OFIs or observations)', async () => {
    const values = await computePlatformMetrics({ organizationId: 'org_1', now });
    expect(values.finding_ageing.value).toBe('2');
    expect(values.finding_ageing.note).toContain('1 past their due date');
  });

  it('scopes member and policy queries to the organization', async () => {
    await computePlatformMetrics({ organizationId: 'org_1', now });
    expect((mockDb.member.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      isActive: true,
      deactivated: false,
    });
    expect((mockDb.policy.findMany as jest.Mock).mock.calls[0][0].where.organizationId).toBe('org_1');
  });
});
