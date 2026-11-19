/** Shared org fixture for the overview builder specs. */
import type { OverviewData } from './overview-data';
import { emptyOverviewData } from './overview-data.fixturespec';

export const NOW = new Date('2026-11-18T12:00:00.000Z');
export const daysFromNow = (days: number) =>
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

const vendor = (fields: Record<string, unknown>) => ({
  status: 'assessed',
  inherentProbability: 'very_unlikely',
  inherentImpact: 'insignificant',
  assignee: null,
  documents: [],
  ...fields,
});
const trainee = (
  memberId: string,
  status: string,
  expiresAt: Date | null,
  neverTrained = false,
) => ({
  memberId,
  name: memberId,
  email: `${memberId}@example.com`,
  status,
  neverTrained,
  completedAt: null,
  expiresAt,
});

export function makeData(overrides: Partial<OverviewData> = {}): OverviewData {
  return emptyOverviewData({
    taskProgress: { total: 6, done: 3, notRelevant: 1 },
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
        submittedForApprovalAt: null,
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
        submittedForApprovalAt: null,
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
        submittedForApprovalAt: null,
      },
    ],
    members: [member('mem_a'), member('mem_b'), member('mem_c', 'hr')],
    training: {
      inScope: 4,
      trained: 2,
      expired: 1,
      neverTrained: 1,
      members: [
        trainee('mem_a', 'complete', daysFromNow(160)),
        trainee('mem_b', 'expired', daysFromNow(-5)),
        trainee('mem_c', 'complete', daysFromNow(12)),
        trainee('mem_d', 'incomplete', null, true),
      ],
    },
    vendors: [
      vendor({
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
      }),
      vendor({
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
      }),
      vendor({
        id: 'vnd_new',
        status: 'not_assessed',
        name: 'Stripe',
        criticality: 'high',
        handlesCardholderData: false,
        affectsCdeSecurity: false,
        lastReviewedAt: null,
        nextReviewDue: null,
      }),
    ],
    checkRuns: [
      { id: 'icr_1', checkName: 'MFA', status: 'success', failedCount: 2 },
      { id: 'icr_2', checkName: 'S3', status: 'failed', failedCount: 0 },
      { id: 'icr_3', checkName: 'Repo', status: 'success', failedCount: 0 },
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
  } as Partial<OverviewData>);
}

