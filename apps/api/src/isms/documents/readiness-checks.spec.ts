import { buildDocumentReadiness, type ReadinessFacts } from './readiness-checks';

const now = new Date('2026-11-18T00:00:00.000Z');
const facts = (overrides: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  status: 'draft',
  hasNarrative: false,
  internalIssues: 0,
  externalIssues: 0,
  parties: 0,
  requirements: [],
  objectives: [],
  roleMessages: [],
  unacknowledgedAssignments: 0,
  metricMessages: [],
  overdueMetrics: 0,
  riskTreatmentMessages: [],
  completedAuditDates: [],
  auditMessages: [],
  completedReviewDates: [],
  ...overrides,
});

describe('buildDocumentReadiness', () => {
  it('lists what is missing for interested-party requirements (4.2b)', () => {
    const result = buildDocumentReadiness({
      type: 'interested_parties_requirements',
      documentId: 'doc_1',
      now,
      facts: facts({
        requirements: [
          { ownerMemberId: 'mem_1', lastReviewedAt: new Date('2026-06-01') },
          { ownerMemberId: null, lastReviewedAt: new Date('2024-01-01') },
        ],
      }),
    });
    expect(result.missing).toEqual([
      'Give every requirement an owner',
      'Review every requirement in the last 12 months',
      'Approve and publish the document',
    ]);
    expect(result.percent).toBe(25);
  });

  it('is 100% for an approved scope with a narrative', () => {
    const result = buildDocumentReadiness({
      type: 'isms_scope',
      documentId: 'doc_1',
      now,
      facts: facts({ status: 'approved', hasNarrative: true }),
    });
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it('surfaces role validation messages and pending acknowledgements', () => {
    const result = buildDocumentReadiness({
      type: 'roles_and_responsibilities',
      documentId: 'doc_1',
      now,
      facts: facts({
        roleMessages: ['Internal Auditor needs at least one assigned member.'],
        unacknowledgedAssignments: 2,
      }),
    });
    expect(result.missing).toEqual([
      'Internal Auditor needs at least one assigned member.',
      'Every role holder has acknowledged their role',
      'Approve and publish the document',
    ]);
  });

  it('requires an internal audit and a management review within 12 months', () => {
    const audit = buildDocumentReadiness({
      type: 'internal_audit',
      documentId: 'doc_1',
      now,
      facts: facts({ completedAuditDates: [new Date('2025-06-01')] }),
    });
    expect(audit.missing).toContain('Complete an internal audit in the last 12 months');

    const review = buildDocumentReadiness({
      type: 'management_review',
      documentId: 'doc_2',
      now,
      facts: facts({ completedReviewDates: [new Date('2026-03-01')] }),
    });
    expect(review.missing).toEqual(['Approve and publish the document']);
  });
});
