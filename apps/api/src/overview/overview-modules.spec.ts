jest.mock('@db', () => ({ db: {} }));
jest.mock('../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));

import { buildAttentionCards } from './overview-attention';
import type { OverviewData } from './overview-data';
import { emptyOverviewData } from './overview-data.fixturespec';
import { addBusinessDays } from './overview-deadline-sources';
import { buildDeadlines } from './overview-deadlines';
import { countTaskProgress } from './task-progress';

const NOW = new Date('2026-11-18T12:00:00.000Z'); // a Wednesday
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const cadence = (kind: 'external_asv' | 'internal', nextDueAt: Date | null) => ({
  kind,
  cadenceDays: 90,
  lastScanAt: nextDueAt ? days(-80) : null,
  lastPassingAt: nextDueAt ? days(-80) : null,
  nextDueAt,
  overdue: !nextDueAt || nextDueAt < NOW,
  quarters: [],
});

const nc = (id: string, status: 'open' | 'in_progress', dueDate: Date | null) => ({
  id,
  kind: 'standalone' as const,
  reference: id.toUpperCase(),
  source: 'incident',
  sourceRef: null,
  severity: null,
  description: `Issue ${id}`,
  rootCause: null,
  correctiveAction: null,
  ownerMemberId: null,
  dueDate,
  status,
  closureEvidence: null,
  effectivenessReviewedAt: null,
  effectivenessReviewedById: null,
  effectivenessNotes: null,
  createdAt: days(-30),
});

const data: OverviewData = emptyOverviewData({
  hasPciDss: true,
  people: [
    { memberId: 'm1', name: 'Ana', former: false, overall: 'complete' },
    { memberId: 'm2', name: 'Bo', former: false, overall: 'incomplete' },
    { memberId: 'm3', name: 'Cy', former: true, overall: 'incomplete' },
  ],
  risks: [
    {
      id: 'r1',
      title: 'Card data leak',
      assigneeId: null,
      residualLikelihood: 'likely',
      residualImpact: 'major',
      latestAcceptance: null,
    },
    {
      id: 'r2',
      title: 'Phishing',
      assigneeId: 'm1',
      residualLikelihood: 'very_unlikely',
      residualImpact: 'minor',
      latestAcceptance: null,
    },
  ],
  riskActions: [
    { id: 'ta1', title: 'Enable DLP', dueDate: days(-3), entityId: 'r2', assignee: null },
  ],
  riskRegisterReviewDue: days(-1),
  assets: [
    { id: 'a1', ownerId: null, cdeScope: 'unassessed', lastReviewedAt: null },
    { id: 'a2', ownerId: 'm1', cdeScope: 'in_scope', lastReviewedAt: days(-20) },
  ],
  vulnerabilities: [
    { id: 'v1', title: 'OpenSSL', severity: 'critical', status: 'open', slaDueAt: days(-2), owner: null },
    { id: 'v2', title: 'TLS 1.0', severity: 'medium', status: 'open', slaDueAt: days(10), owner: null },
    { id: 'v3', title: 'Banner', severity: 'low', status: 'open', slaDueAt: days(100), owner: null },
  ],
  scanCadence: [cadence('external_asv', null), cadence('internal', days(10))],
  nonconformities: [nc('nc-1', 'open', days(-5)), nc('nc-2', 'in_progress', null)],
  nonconformitiesTotal: 4,
  reviewActions: [
    {
      id: 'mra1',
      reference: 'A01',
      description: 'Budget for SIEM',
      dueDate: days(5),
      review: { reference: 'MR-2026-01' },
    },
  ],
  ismsDocuments: [
    { id: 'd1', title: 'Scope', status: 'needs_review', currentVersionId: null },
    { id: 'd2', title: 'Context', status: 'draft', currentVersionId: null },
    { id: 'd3', title: 'Roles', status: 'approved', currentVersionId: 'v1' },
  ],
  questionnaires: [
    { id: 'q1', filename: 'acme.xlsx', createdAt: days(-3) },
    { id: 'q2', filename: 'beta.xlsx', createdAt: days(-1) },
  ],
  auditRequests: [
    { id: 'aer1', title: 'Firewall config', dueDate: null, auditId: 'aud1', audit: { title: 'ROC 2026' } },
  ],
  overduePhases: [
    {
      timelineId: 'tl1',
      frameworkInstanceId: 'fi_pci',
      frameworkName: 'PCI DSS',
      phaseId: 'ph1',
      phaseName: 'Gap assessment',
      dueDate: days(-4),
    },
  ],
});

describe('module attention cards', () => {
  const cards = Object.fromEntries(
    buildAttentionCards({ data, now: NOW }).map((c) => [c.module, c]),
  );

  it('flags people who are not fully compliant and leavers with offboarding open', () => {
    expect(cards.people).toMatchObject({ total: 2, ok: 1, needsAttention: 2 });
  });

  it('flags overdue actions, the register review, unaccepted residual risk and unowned risks', () => {
    expect(cards.risks).toMatchObject({ total: 2, ok: 0, needsAttention: 3 });
    expect(cards.risks.reasons).toEqual([
      { label: 'Treatment actions overdue', count: 1 },
      { label: 'Register review overdue', count: 1 },
      { label: 'Residual risk awaiting acceptance', count: 1 },
      { label: 'No owner', count: 1 },
    ]);
  });

  it('flags assets without owner, scope or a review in 12 months', () => {
    expect(cards.assets).toMatchObject({ total: 2, needsAttention: 1 });
    expect(cards.assets.reasons.map((r) => r.count)).toEqual([1, 1, 1]);
  });

  it('flags SLA breaches, critical findings and a missing passing ASV scan', () => {
    expect(cards.vulnerabilities).toMatchObject({ total: 3, ok: 1, needsAttention: 3 });
    expect(cards.vulnerabilities.reasons).toEqual([
      { label: 'Past remediation SLA', count: 1 },
      { label: 'Due within 14 days', count: 1 },
      { label: 'Critical', count: 1 },
      { label: 'No passing ASV scan this quarter', count: 1 },
    ]);
  });

  it('counts open corrective actions from the 10.2 register', () => {
    expect(cards.correctiveActions).toMatchObject({ total: 4, needsAttention: 2, ok: 2 });
  });

  it('flags ISMS documents waiting for or never given approval', () => {
    expect(cards.documents).toMatchObject({ total: 3, needsAttention: 2, ok: 1 });
  });

  it('flags questionnaire reviews waiting more than 2 days', () => {
    expect(cards.questionnaires.reasons).toEqual([
      { label: 'Waiting over 2 days', count: 1 },
      { label: 'Waiting for review', count: 1 },
    ]);
  });

  it('lays out 14 cards, one per module', () => {
    expect(Object.keys(cards)).toHaveLength(14);
  });
});

describe('module deadlines', () => {
  const result = buildDeadlines({ data, now: NOW, windowDays: 30 });
  const types = (items: Array<{ type: string }>) => items.map((i) => i.type);

  it('queues every dated module item as overdue or due soon', () => {
    expect(types(result.overdue)).toEqual(
      expect.arrayContaining([
        'vulnerability',
        'corrective_action',
        'risk_action',
        'risk_review',
        'timeline_phase',
      ]),
    );
    expect(types(result.dueSoon)).toEqual(
      expect.arrayContaining(['review_action', 'questionnaire_review', 'scan', 'vulnerability']),
    );
  });

  it('lists undated work and never-run scans under no due date', () => {
    expect(result.noDueDate.map((i) => i.id)).toEqual(['aer1', 'nc-2', 'scan:external_asv']);
  });

  it('gives questionnaire reviews five business days', () => {
    // Created Sunday 15 Nov → due Friday 20 Nov.
    const q = result.dueSoon.find((i) => i.id === 'q1');
    expect(q?.dueDate).toBe(addBusinessDays({ date: days(-3), days: 5 }).toISOString());
    expect(new Date(q?.dueDate ?? '').getUTCDay()).toBe(5);
  });

  it('dates policy approvals 30 days after submission', () => {
    const withApproval = emptyOverviewData({
      policies: [
        {
          id: 'pol1',
          name: 'Access Control',
          status: 'needs_review',
          reviewDate: null,
          isRequiredToSign: false,
          signedBy: [],
          visibility: 'ALL',
          visibleToDepartments: [],
          assignee: null,
          submittedForApprovalAt: days(-40),
        },
      ],
    });
    const queue = buildDeadlines({ data: withApproval, now: NOW });
    expect(queue.overdue).toEqual([
      expect.objectContaining({ id: 'pol1', type: 'policy_approval' }),
    ]);
  });
});

describe('countTaskProgress', () => {
  it('reports not-relevant tasks apart from the denominator', () => {
    expect(
      countTaskProgress([
        { status: 'done', count: 3 },
        { status: 'todo', count: 2 },
        { status: 'not_relevant', count: 4 },
      ]),
    ).toEqual({ total: 5, done: 3, notRelevant: 4 });
  });
});
