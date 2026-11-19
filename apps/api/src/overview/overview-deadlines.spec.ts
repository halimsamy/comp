jest.mock('@db', () => ({ db: {} }));
jest.mock('../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));

import { buildAttentionCards } from './overview-attention';
import type { OverviewData } from './overview-data';
import { buildDeadlines } from './overview-deadlines';
import { daysFromNow, makeData, NOW } from './overview-builders.fixturespec';

describe('buildDeadlines', () => {
  it('splits a sorted queue into overdue, due soon and no due date', () => {
    const result = buildDeadlines({
      data: makeData(),
      now: NOW,
      windowDays: 30,
    });
    expect(result.overdue.map((i) => i.id)).toEqual([
      'vnd_aws',
      'mem_b:training',
      'tsk_overdue',
      'arv_2',
      'pol_old',
    ]);
    expect(result.dueSoon.map((i) => i.id)).toEqual([
      'tsk_soon',
      'mem_c:training',
      'pol_pub',
      'vnd_slack:soc2_type2',
    ]);
    // Open tasks without a date can never be overdue, so they are listed apart.
    expect(result.noDueDate.map((i) => i.id)).toEqual(['tsk_failed', 'tsk_todo']);
    expect(result.noDueDateCount).toBe(2);
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

  it('queues company forms by next due date and required unsubmitted forms as undated', () => {
    type Form = OverviewData['forms'][number];
    const form = (formType: Form['formType'], fields: Partial<Form>): Form => ({
      formType,
      title: formType,
      optional: false,
      status: 'ok',
      nextDueAt: null,
      ownerName: null,
      ...fields,
    });
    const data = makeData({
      tasks: [],
      forms: [
        form('meeting', { status: 'overdue', nextDueAt: daysFromNow(-3), ownerName: 'Ana' }),
        form('whistleblower-report', { status: 'due_soon', nextDueAt: daysFromNow(10) }),
        form('access-request', { status: 'never_submitted' }),
        form('employee-performance-evaluation', { status: 'never_submitted', optional: true }),
      ],
    });
    const result = buildDeadlines({ data, now: NOW, windowDays: 30 });
    expect(result.overdue.find((i) => i.type === 'form')).toMatchObject({
      id: 'meeting',
      href: '/documents/meeting',
      ownerName: 'Ana',
    });
    expect(result.dueSoon.filter((i) => i.type === 'form').map((i) => i.id)).toEqual(['whistleblower-report']);
    expect(result.noDueDate.filter((i) => i.type === 'form').map((i) => i.id)).toEqual(['access-request']);

    const documents = buildAttentionCards({ data, now: NOW }).find((c) => c.module === 'documents');
    expect(documents).toMatchObject({ total: 3, needsAttention: 2 });
    expect(documents?.reasons).toEqual([
      { label: 'Forms overdue', count: 1, href: '/documents' },
      { label: 'Forms never submitted', count: 1, href: '/documents' },
    ]);
  });
});
