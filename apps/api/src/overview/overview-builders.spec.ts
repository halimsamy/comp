jest.mock('@db', () => ({ db: {} }));
jest.mock('../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));

import { buildAttentionCards } from './overview-attention';
import type { OverviewData } from './overview-data';
import { buildDeadlines } from './overview-deadlines';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const person = (name: string) => ({
  user: { name, email: `${name.toLowerCase()}@example.com` },
});
const member = (id: string, department = 'it') => ({
  id,
  role: 'employee',
  department,
  user: { name: id, email: `${id}@example.com`, role: 'user' },
});

function makeData(overrides: Partial<OverviewData> = {}): OverviewData {
  return {
    tasks: [
      {
        id: 'tsk_overdue',
        title: 'Access review log',
        status: 'done',
        reviewDate: daysFromNow(-3),
        assignee: person('Ana'),
      },
      {
        id: 'tsk_soon',
        title: 'Vulnerability scan',
        status: 'done',
        reviewDate: daysFromNow(10),
        assignee: null,
      },
      {
        id: 'tsk_failed',
        title: 'MFA check',
        status: 'failed',
        reviewDate: null,
        assignee: null,
      },
      {
        id: 'tsk_review',
        title: 'Firewall rules',
        status: 'in_review',
        reviewDate: daysFromNow(90),
        assignee: null,
      },
      {
        id: 'tsk_todo',
        title: 'Pentest',
        status: 'todo',
        reviewDate: null,
        assignee: null,
      },
      {
        id: 'tsk_ok',
        title: 'Backups',
        status: 'done',
        reviewDate: daysFromNow(80),
        assignee: null,
      },
    ],
    policies: [
      {
        id: 'pol_pub',
        name: 'Access Control',
        status: 'published',
        reviewDate: daysFromNow(20),
        isRequiredToSign: true,
        signedBy: ['mem_a'],
        visibility: 'ALL',
        visibleToDepartments: [],
        assignee: null,
      },
      {
        id: 'pol_old',
        name: 'Encryption',
        status: 'published',
        reviewDate: daysFromNow(-1),
        isRequiredToSign: true,
        signedBy: ['mem_a', 'mem_b'],
        visibility: 'DEPARTMENT',
        visibleToDepartments: ['it'],
        assignee: person('Bo'),
      },
      {
        id: 'pol_draft',
        name: 'Incident Response',
        status: 'draft',
        reviewDate: null,
        isRequiredToSign: true,
        signedBy: [],
        visibility: 'ALL',
        visibleToDepartments: [],
        assignee: null,
      },
    ],
    members: [member('mem_a'), member('mem_b'), member('mem_c', 'hr')],
    trainingRecords: [
      // Superseded by a renewal: must not show as expired.
      { memberId: 'mem_a', moduleId: 'sat-1', expiresAt: daysFromNow(-200) },
      { memberId: 'mem_a', moduleId: 'sat-1', expiresAt: daysFromNow(160) },
      { memberId: 'mem_b', moduleId: 'sat-1', expiresAt: daysFromNow(-5) },
      { memberId: 'mem_b', moduleId: 'sat-2', expiresAt: daysFromNow(100) },
      { memberId: 'mem_c', moduleId: 'trm_code', expiresAt: daysFromNow(12) },
      { memberId: 'mem_c', moduleId: 'trm_off', expiresAt: daysFromNow(-50) },
      { memberId: 'mem_gone', moduleId: 'sat-1', expiresAt: daysFromNow(-50) },
    ],
    trainingModules: [
      {
        id: 'trm_code',
        title: 'Secure coding (PCI DSS 6.2.2)',
        isEnabled: true,
      },
      { id: 'trm_off', title: 'Retired module', isEnabled: false },
    ],
    vendors: [
      {
        id: 'vnd_aws',
        name: 'AWS',
        criticality: 'critical',
        handlesCardholderData: true,
        affectsCdeSecurity: true,
        lastReviewedAt: daysFromNow(-200),
        nextReviewDue: daysFromNow(-17),
        assignee: null,
        documents: [
          { type: 'pci_aoc', name: 'AOC 2025', expiresAt: daysFromNow(-30) },
          { type: 'pci_aoc', name: 'AOC 2026', expiresAt: daysFromNow(300) },
        ],
      },
      {
        id: 'vnd_slack',
        name: 'Slack',
        criticality: 'low',
        handlesCardholderData: false,
        affectsCdeSecurity: false,
        lastReviewedAt: null,
        nextReviewDue: null,
        assignee: null,
        documents: [
          { type: 'soc2_type2', name: 'SOC 2', expiresAt: daysFromNow(20) },
        ],
      },
      {
        id: 'vnd_new',
        name: 'Stripe',
        criticality: 'high',
        handlesCardholderData: false,
        affectsCdeSecurity: false,
        lastReviewedAt: null,
        nextReviewDue: null,
        assignee: null,
        documents: [],
      },
    ],
    checkRuns: [
      { id: 'icr_1', checkName: 'MFA', status: 'success', failedCount: 2 },
      { id: 'icr_2', checkName: 'S3', status: 'failed', failedCount: 0 },
      { id: 'icr_3', checkName: 'Repo', status: 'success', failedCount: 0 },
    ],
    findings: [
      { status: 'open', count: 2 },
      { status: 'closed', count: 5 },
    ],
    accessReviews: [
      {
        id: 'arv_1',
        name: 'H1 review',
        status: 'completed',
        dueDate: daysFromNow(-240),
        signedOffAt: daysFromNow(-230),
      },
      {
        id: 'arv_2',
        name: 'H2 review',
        status: 'in_progress',
        dueDate: daysFromNow(-2),
        signedOffAt: null,
      },
    ],
    ...overrides,
  } as OverviewData;
}

describe('buildAttentionCards', () => {
  const cards = Object.fromEntries(
    buildAttentionCards({ data: makeData(), now: NOW }).map((c) => [
      c.module,
      c,
    ]),
  );

  it('counts tasks as OK only when done and not due again', () => {
    expect(cards.tasks).toMatchObject({ total: 6, ok: 2, needsAttention: 4 });
    expect(cards.tasks.reasons).toEqual([
      { label: 'Overdue', count: 1 },
      { label: 'Failed', count: 1 },
      { label: 'Waiting for review', count: 1 },
      { label: 'Not complete', count: 1 },
    ]);
  });

  it('flags draft policies and overdue reviews', () => {
    expect(cards.policies).toMatchObject({
      total: 3,
      needsAttention: 2,
      ok: 1,
    });
  });

  it('counts pending acknowledgements by policy visibility', () => {
    // pol_pub: 3 members, 1 signed. pol_old: only the it department (a, b), both signed.
    expect(cards.acknowledgements).toMatchObject({
      total: 5,
      needsAttention: 2,
      ok: 3,
    });
  });

  it('uses the current training cycle and ignores disabled modules and inactive members', () => {
    // mem_a security (ok), mem_b security (expired via sat-1), mem_c secure coding (expiring).
    expect(cards.training).toMatchObject({ total: 3, needsAttention: 2 });
  });

  it('applies vendor review and newest-document rules', () => {
    // AWS review overdue (its old AOC is superseded); Slack SOC 2 expiring; Stripe high and never reviewed.
    expect(cards.vendors).toMatchObject({ total: 3, needsAttention: 3 });
  });

  it('reports failing and errored checks, open findings and stale access reviews', () => {
    expect(cards.checks).toMatchObject({ total: 3, needsAttention: 2 });
    expect(cards.findings).toMatchObject({ total: 7, needsAttention: 2 });
    // One overdue in-progress review plus no sign-off within 6 months (PCI DSS 7.2.4).
    expect(cards.accessReviews).toMatchObject({
      total: 2,
      ok: 1,
      needsAttention: 2,
    });
  });
});

describe('buildDeadlines', () => {
  it('splits a sorted queue into overdue and due soon within the window', () => {
    const result = buildDeadlines({
      data: makeData(),
      now: NOW,
      windowDays: 30,
    });
    expect(result.overdue.map((i) => i.id)).toEqual([
      'vnd_aws',
      'mem_b:Security awareness training',
      'tsk_overdue',
      'arv_2',
      'pol_old',
    ]);
    expect(result.dueSoon.map((i) => i.id)).toEqual([
      'tsk_soon',
      'mem_c:Secure coding (PCI DSS 6.2.2)',
      'pol_pub',
      'vnd_slack:soc2_type2',
    ]);
    expect(result.overdueCount).toBe(5);
    expect(result.overdue[2]).toMatchObject({
      href: '/tasks/tsk_overdue',
      ownerName: 'Ana',
      type: 'task',
    });
  });

  it('schedules the next access review six months after the last sign-off', () => {
    const data = makeData({
      accessReviews: [
        {
          id: 'arv_1',
          name: 'H1',
          status: 'completed',
          dueDate: daysFromNow(-200),
          signedOffAt: daysFromNow(-170),
        },
      ],
    });
    const result = buildDeadlines({ data, now: NOW, windowDays: 30 });
    expect(
      result.dueSoon.find((i) => i.id === 'next-access-review'),
    ).toMatchObject({ type: 'access_review' });
  });
});
