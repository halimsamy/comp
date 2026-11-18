import {
  findingAgeing,
  policyAcknowledgement,
  riskTreatmentStatus,
  taskOnTimeRate,
  trainingCompletion,
  vendorReviewCurrency,
} from './metric-compute';

const now = new Date('2026-11-18T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('computed 9.1 metrics', () => {
  it('training completion counts members with every required video', () => {
    const result = trainingCompletion({
      memberIds: ['a', 'b', 'c', 'd'],
      completedVideoIdsByMember: new Map([
        ['a', new Set(['sat-1', 'sat-2'])],
        ['b', new Set(['sat-1'])],
      ]),
      requiredVideoIds: ['sat-1', 'sat-2'],
    });
    expect(result.value).toBe('25%');
    expect(result.note).toContain('1 of 4');
  });

  it('reports n/a when nobody is in scope', () => {
    expect(
      trainingCompletion({
        memberIds: [],
        completedVideoIdsByMember: new Map(),
        requiredVideoIds: ['sat-1'],
      }).value,
    ).toBe('n/a');
  });

  it('policy acknowledgement needs every required policy signed', () => {
    const result = policyAcknowledgement({
      memberIds: ['a', 'b', 'c'],
      requiredPolicies: [{ signedBy: ['a', 'b'] }, { signedBy: ['a'] }],
    });
    expect(result.value).toBe('33.3%');
  });

  it('policy acknowledgement is n/a until a policy requires sign-off', () => {
    expect(
      policyAcknowledgement({ memberIds: ['a'], requiredPolicies: [] }).value,
    ).toBe('n/a');
  });

  it('finding ageing buckets open items and counts past-due ones', () => {
    const result = findingAgeing({
      now,
      openItems: [
        { createdAt: daysAgo(5), dueDate: null },
        { createdAt: daysAgo(45), dueDate: daysAgo(1) },
        { createdAt: daysAgo(120), dueDate: daysAgo(30) },
      ],
    });
    expect(result.value).toBe('3');
    expect(result.note).toBe(
      'Open findings and nonconformities by age: 1 under 30 days, 1 at 30–90 days, 1 over 90 days; 2 past their due date.',
    );
  });

  it('risk treatment ignores archived risks and flags high risks without a plan', () => {
    const result = riskTreatmentStatus({
      risks: [
        { status: 'open', treatmentStrategyDescription: 'MFA everywhere', residualLikelihood: 'likely', residualImpact: 'major' },
        { status: 'open', treatmentStrategyDescription: null, residualLikelihood: 'very_likely', residualImpact: 'severe' },
        { status: 'closed', treatmentStrategyDescription: null, residualLikelihood: 'unlikely', residualImpact: 'minor' },
        { status: 'archived', treatmentStrategyDescription: null, residualLikelihood: 'likely', residualImpact: 'major' },
      ],
    });
    expect(result.value).toBe('66.7%');
    expect(result.note).toContain('1 high residual risks have no plan');
  });

  it('vendor review currency counts assessed vendors', () => {
    expect(
      vendorReviewCurrency({
        now,
        vendors: [
          { criticality: 'critical', lastReviewedAt: daysAgo(30), nextReviewDue: daysAgo(-300), hasDpa: true },
          { criticality: 'critical', lastReviewedAt: daysAgo(400), nextReviewDue: daysAgo(35), hasDpa: true },
          { criticality: 'critical', lastReviewedAt: daysAgo(10), nextReviewDue: null, hasDpa: false },
          { criticality: 'low', lastReviewedAt: null, nextReviewDue: null, hasDpa: false },
        ],
      }).value,
    ).toBe('33.3%');
  });

  it('vendor review currency falls back to all vendors when none is critical', () => {
    const result = vendorReviewCurrency({
      now,
      vendors: [
        { criticality: null, lastReviewedAt: daysAgo(30), nextReviewDue: null, hasDpa: true },
        { criticality: null, lastReviewedAt: null, nextReviewDue: null, hasDpa: true },
      ],
    });
    expect(result.value).toBe('50%');
    expect(result.note).toContain('none classified critical');
  });

  it('task on-time rate treats a past next-due date as late', () => {
    const result = taskOnTimeRate({
      now,
      tasks: [{ reviewDate: daysAgo(-10) }, { reviewDate: null }, { reviewDate: daysAgo(3) }],
    });
    expect(result.value).toBe('66.7%');
  });
});
