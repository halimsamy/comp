const mockDb = {
  ismsDocument: { findMany: jest.fn() },
  ismsAudit: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  backgroundCheckRequest: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  employeeTrainingVideoCompletion: { findMany: jest.fn() },
  device: { findMany: jest.fn() },
  organizationChartSnapshot: { findFirst: jest.fn() },
  accessReview: { findFirst: jest.fn() },
  offboardingChecklistTemplate: { count: jest.fn() },
  vendor: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../../utils/compliance-filters', () => ({
  filterComplianceMembers: async <T>(members: T[]) => members,
}));
jest.mock('@trycompai/company', () => ({ GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'] }));

import { NATIVE_EVIDENCE_RULES } from './native-evidence-rules';
import { accessReviewPeriodMonths, accessReviewRule, supplierEvaluationRule } from './rules/access-vendor-rules';
import { deviceListRule, orgChartRule, secureDevicesRule } from './rules/device-chart-rules';
import { internalAuditRule, riskTreatmentPlanRule } from './rules/isms-rules';
import { employeeVerificationRule, securityTrainingRule } from './rules/people-rules';

const NOW = new Date('2026-11-18T00:00:00Z');
const ctx = { organizationId: 'org_1', now: NOW, frequency: null };
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const member = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  role: 'employee',
  onboardDate: daysAgo(30),
  createdAt: daysAgo(30),
  backgroundCheckExempt: false,
  backgroundCheckExemptReason: null,
  user: { name: id.toUpperCase(), email: `${id}@x.io`, role: 'user' },
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

it('maps the eight task templates (nine with both device tasks)', () => {
  expect(Object.keys(NATIVE_EVIDENCE_RULES)).toHaveLength(9);
});

describe('ISMS rules', () => {
  it('RTP holds only for a version published in the last 12 months', async () => {
    const doc = (publishedAt: Date) => ({
      title: 'RTP',
      currentVersion: { id: 'v1', version: 2, publishedAt, changelog: null, publishedBy: null },
    });
    mockDb.ismsDocument.findMany.mockResolvedValue([doc(daysAgo(100))]);
    expect((await riskTreatmentPlanRule.evaluate(ctx)).holds).toBe(true);
    expect(mockDb.ismsDocument.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      type: 'risk_treatment_plan',
    });
    mockDb.ismsDocument.findMany.mockResolvedValue([doc(daysAgo(400))]);
    expect((await riskTreatmentPlanRule.evaluate(ctx)).holds).toBe(false);
  });

  it('internal audit needs completion plus auditor and top-management sign-off', async () => {
    const audit = {
      id: 'aud', reference: 'IA-2026-01', status: 'complete', scope: 's', criteria: 'c',
      auditorName: 'Ann', plannedStartDate: null, plannedEndDate: null, conclusionVerdict: 'conform',
      signoffAuditorName: 'Ann', signoffAuditorDate: daysAgo(10), signoffSpoName: null, signoffSpoDate: null,
      signoffTopMgmtName: 'Bob', signoffTopMgmtDate: null, findings: [],
    };
    mockDb.ismsAudit.findMany.mockResolvedValue([audit]);
    expect((await internalAuditRule.evaluate(ctx)).holds).toBe(false);
    mockDb.ismsAudit.findMany.mockResolvedValue([{ ...audit, signoffTopMgmtDate: daysAgo(5) }]);
    const result = await internalAuditRule.evaluate(ctx);
    expect(result.holds).toBe(true);
    expect(mockDb.ismsAudit.findMany.mock.calls[0][0].where).toEqual({
      document: { organizationId: 'org_1', type: 'internal_audit' },
    });
  });
});

describe('People rules', () => {
  it('employee verification accepts completed or exempt joiners only', async () => {
    mockDb.member.findMany.mockResolvedValue([
      member('a'),
      member('b', { backgroundCheckExempt: true }),
      member('old', { onboardDate: daysAgo(500) }),
    ]);
    mockDb.backgroundCheckRequest.findMany.mockResolvedValue([{ memberId: 'a', status: 'completed', completedAt: NOW }]);
    const result = await employeeVerificationRule.evaluate(ctx);
    expect(result.holds).toBe(true);
    expect(result.summary).toBe('2 of 2 joiners verified');

    mockDb.backgroundCheckRequest.findMany.mockResolvedValue([{ memberId: 'a', status: 'in_progress', completedAt: null }]);
    const failing = await employeeVerificationRule.evaluate(ctx);
    expect(failing.holds).toBe(false);
    expect(failing.issues).toEqual(['Background check missing: A']);
  });

  it('training needs every module within 12 months and the training step on', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ securityTrainingStepEnabled: true });
    mockDb.member.findMany.mockResolvedValue([member('a'), member('b')]);
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { memberId: 'a', completedAt: daysAgo(3) },
      { memberId: 'a', completedAt: daysAgo(2) },
      { memberId: 'b', completedAt: daysAgo(2) },
    ]);
    const result = await securityTrainingRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['Training outstanding: B']);
    expect(mockDb.employeeTrainingVideoCompletion.findMany.mock.calls[0][0].where.completedAt.gte).toEqual(
      new Date('2025-11-18T00:00:00Z'),
    );
  });

  it('devices must have checked in recently, and secure devices must be compliant', async () => {
    mockDb.organization.findUnique.mockResolvedValue({ deviceAgentStepEnabled: true });
    mockDb.member.findMany.mockResolvedValue([member('a')]);
    const device = {
      id: 'd1', memberId: 'a', name: 'Mac', platform: 'macos', osVersion: '15', serialNumber: null,
      isCompliant: false, diskEncryptionEnabled: true, antivirusEnabled: true, screenLockEnabled: true,
      lastCheckIn: daysAgo(2), updatedAt: daysAgo(2),
    };
    mockDb.device.findMany.mockResolvedValue([device]);
    expect((await deviceListRule.evaluate(ctx)).holds).toBe(true);
    expect((await secureDevicesRule.evaluate(ctx)).holds).toBe(false);
    mockDb.device.findMany.mockResolvedValue([{ ...device, lastCheckIn: daysAgo(60) }]);
    expect((await deviceListRule.evaluate(ctx)).holds).toBe(false);
  });

  it('org chart needs a snapshot from the last 12 months', async () => {
    mockDb.organizationChartSnapshot.findFirst.mockResolvedValue({
      id: 'ocs', name: 'Q4', createdAt: daysAgo(20), nodes: [{ data: { name: 'Ann', title: 'CEO' } }],
    });
    const result = await orgChartRule.evaluate(ctx);
    expect(result.holds).toBe(true);
    expect(result.sections[1].table?.rows).toEqual([['Ann', 'CEO']]);
    mockDb.organizationChartSnapshot.findFirst.mockResolvedValue(null);
    expect((await orgChartRule.evaluate(ctx)).holds).toBe(false);
  });
});

describe('Access review and vendor rules', () => {
  it('caps the access review period at six months (PCI DSS 7.2.4)', () => {
    expect(accessReviewPeriodMonths('quarterly')).toBe(3);
    expect(accessReviewPeriodMonths('yearly')).toBe(6);
  });

  it('access review needs a sign-off and every leaver offboarded', async () => {
    mockDb.accessReview.findFirst.mockResolvedValue({
      id: 'arv', name: 'Q4', signedOffAt: daysAgo(5), signedOffByName: 'Bob', _count: { items: 4 },
    });
    mockDb.offboardingChecklistTemplate.count.mockResolvedValue(2);
    mockDb.member.findMany.mockResolvedValue([
      { id: 'l', deactivated: true, offboardDate: daysAgo(10), user: { name: 'Leo', email: 'l@x.io' }, offboardingChecklistCompletions: [{}] },
    ]);
    const result = await accessReviewRule.evaluate({ ...ctx, frequency: 'quarterly' });
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['Offboarding not finished: Leo']);
    expect(mockDb.accessReview.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      status: 'completed',
    });
  });

  it('supplier evaluation fails on overdue or unreviewed critical vendors', async () => {
    const vendor = (id: string, nextReviewDue: Date | null) => ({
      id, name: id, criticality: 'critical', lastReviewedAt: nextReviewDue ? daysAgo(30) : null, nextReviewDue, reviews: [],
    });
    mockDb.vendor.findMany.mockResolvedValue([vendor('AWS', daysAgo(-90)), vendor('Stripe', null)]);
    const result = await supplierEvaluationRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['Review overdue or missing: Stripe']);
    mockDb.vendor.findMany.mockResolvedValue([]);
    expect((await supplierEvaluationRule.evaluate(ctx)).holds).toBe(false);
  });
});
