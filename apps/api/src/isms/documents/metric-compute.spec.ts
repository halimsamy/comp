import {
  findingAgeing,
  policyAcknowledgement,
  riskTreatmentStatus,
  taskOnTimeRate,
  trainingCompletion,
  vendorReviewCurrency,
  vulnerabilityRemediationWithinSla,
} from './metric-compute';

const now = new Date('2026-11-18T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('computed 9.1 metrics', () => {
  it('training completion counts complete over members who must train', () => {
    const result = trainingCompletion({
      members: [
        { status: 'complete' },
        { status: 'expired' },
        { status: 'incomplete' },
        { status: 'not_required' },
      ],
    });
    expect(result.value).toBe('33.3%');
    expect(result.note).toContain('1 of 3');
    expect(result.note).toContain('1 expired');
  });

  it('reports n/a when nobody is in scope', () => {
    expect(trainingCompletion({ members: [{ status: 'not_required' }] }).value).toBe('n/a');
  });

  it('policy acknowledgement uses the coverage of people with assigned policies', () => {
    const result = policyAcknowledgement({
      coverage: {
        requiredPolicies: 2,
        pending: 2,
        peopleAssigned: new Set(['a', 'b', 'c']),
        peoplePending: new Set(['b', 'c']),
      },
    });
    expect(result.value).toBe('33.3%');
    expect(result.note).toContain('2 sign-offs pending');
  });

  it('policy acknowledgement is n/a until a policy requires sign-off', () => {
    expect(
      policyAcknowledgement({
        coverage: { requiredPolicies: 0, pending: 0, peopleAssigned: new Set(), peoplePending: new Set() },
      }).value,
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

  it('vendor review currency counts current and due-soon reviews as in date', () => {
    const result = vendorReviewCurrency({
      statuses: ['current', 'due_soon', 'overdue', 'never_reviewed'],
    });
    expect(result.value).toBe('50%');
    expect(result.note).toContain('1 overdue and 1 never reviewed');
  });

  it('vendor review currency is n/a with no vendor in review scope', () => {
    expect(vendorReviewCurrency({ statuses: [] }).value).toBe('n/a');
  });

  it('task on-time rate treats a past next-due date as late', () => {
    const result = taskOnTimeRate({
      now,
      tasks: [{ reviewDate: daysAgo(-10) }, { reviewDate: null }, { reviewDate: daysAgo(3) }],
    });
    expect(result.value).toBe('66.7%');
  });

  it('vulnerability remediation counts fixes by the SLA due date (#49)', () => {
    const result = vulnerabilityRemediationWithinSla({
      vulnerabilities: [
        { resolvedAt: daysAgo(2), slaDueAt: daysAgo(5) }, // closed late
        { resolvedAt: daysAgo(20), slaDueAt: daysAgo(5) }, // met
        { resolvedAt: null, slaDueAt: daysAgo(1) }, // open past due
        { resolvedAt: null, slaDueAt: daysAgo(-10) }, // open, not due yet
        { resolvedAt: null, slaDueAt: null }, // no SLA
      ],
      now,
    });
    expect(result.value).toBe('33.3%');
    expect(result.note).toContain('1 of 3');
  });

  it('vulnerability remediation is n/a before anything is due', () => {
    expect(
      vulnerabilityRemediationWithinSla({
        vulnerabilities: [{ resolvedAt: null, slaDueAt: daysAgo(-3) }],
        now,
      }).value,
    ).toBe('n/a');
  });
});
