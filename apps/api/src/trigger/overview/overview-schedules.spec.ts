const mockDb = {
  organization: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  schedules: { task: (definition: unknown) => definition },
}));
jest.mock('@trycompai/auth', () => ({
  isOrgParticipant: (role: string | null) => role !== 'admin',
}));
jest.mock('@trycompai/email', () => ({
  isUserUnsubscribed: jest.fn(),
  getUnsubscribeUrl: () => 'https://example.com/unsubscribe',
}));
jest.mock('../../email/trigger-email', () => ({ triggerEmail: jest.fn() }));
jest.mock('../../email/templates/weekly-compliance-digest', () => ({
  WeeklyComplianceDigestEmail: (props: unknown) => ({ props }),
}));
jest.mock('../../overview/compliance-snapshots', () => ({
  recordComplianceSnapshots: jest.fn(),
}));
jest.mock('../../overview/overview-data', () => ({
  loadOverviewData: jest.fn(),
}));
jest.mock('../../overview/overview-attention', () => ({
  buildAttentionCards: jest.fn(),
}));
jest.mock('../../overview/overview-deadlines', () => ({
  buildDeadlines: jest.fn(),
}));

import { isUserUnsubscribed } from '@trycompai/email';
import { loadOverviewData } from '../../overview/overview-data';
import { triggerEmail } from '../../email/trigger-email';
import { recordComplianceSnapshots } from '../../overview/compliance-snapshots';
import { buildAttentionCards } from '../../overview/overview-attention';
import { buildDeadlines } from '../../overview/overview-deadlines';
import { recordComplianceSnapshotsForAllOrgs } from './compliance-snapshot-schedule';
import {
  complianceDigestFrequency,
  isDigestRecipient,
  sendWeeklyComplianceDigests,
} from './weekly-compliance-digest';

beforeEach(() => jest.clearAllMocks());

describe('recordComplianceSnapshotsForAllOrgs', () => {
  it('snapshots every org and keeps going when one fails', async () => {
    mockDb.organization.findMany.mockResolvedValue([
      { id: 'org_a' },
      { id: 'org_b' },
    ]);
    (recordComplianceSnapshots as jest.Mock)
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('boom'));

    const result = await recordComplianceSnapshotsForAllOrgs(
      new Date('2026-11-18T02:30:00Z'),
    );

    expect(recordComplianceSnapshots).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ organizations: 2, snapshots: 2 });
  });
});

describe('sendWeeklyComplianceDigests', () => {
  const deadlines = {
    windowDays: 30,
    overdueCount: 1,
    dueSoonCount: 0,
    overdue: [
      {
        id: 't1',
        type: 'task',
        title: 'Scan',
        subtitle: null,
        dueDate: '2026-11-01T00:00:00Z',
        href: '/tasks/t1',
        ownerName: null,
      },
    ],
    dueSoon: [],
    noDueDateCount: 0,
  };
  const MONDAY = new Date('2026-11-16T08:00:00Z');
  const TUESDAY = new Date('2026-11-17T08:00:00Z');
  const owner = (email: string, emailPreferences: unknown = null) => ({
    id: `mem_${email}`,
    role: 'owner',
    user: { name: email, email, role: 'user', emailPreferences },
  });
  const setup = () => {
    mockDb.organization.findMany.mockResolvedValue([
      { id: 'org_a', name: 'Spare', isInternal: false },
    ]);
    (loadOverviewData as jest.Mock).mockResolvedValue({
      tasks: [
        { id: 't_mine', title: 'Mine', status: 'todo', assigneeId: 'mem_o@spare.com' },
        { id: 't_free', title: 'Unassigned', status: 'in_progress', assigneeId: null },
        { id: 't_other', title: 'Other', status: 'todo', assigneeId: 'mem_x' },
        { id: 't_done', title: 'Done', status: 'done', assigneeId: null },
      ],
    });
    (buildAttentionCards as jest.Mock).mockReturnValue([
      { label: 'Tasks', needsAttention: 1, href: '/tasks' },
    ]);
    (buildDeadlines as jest.Mock).mockReturnValue(deadlines);
    (isUserUnsubscribed as jest.Mock).mockResolvedValue(false);
  };
  const sentTo = () =>
    (triggerEmail as jest.Mock).mock.calls.map(([call]) => call.to);

  it('emails subscribed owners and admins only', async () => {
    (loadOverviewData as jest.Mock).mockResolvedValue({ tasks: [] });
    mockDb.organization.findMany.mockResolvedValue([
      { id: 'org_a', name: 'Spare', isInternal: false },
    ]);
    (buildAttentionCards as jest.Mock).mockReturnValue([
      { label: 'Tasks', needsAttention: 1, href: '/tasks' },
    ]);
    (buildDeadlines as jest.Mock).mockReturnValue(deadlines);
    mockDb.member.findMany.mockResolvedValue([
      {
        id: 'mem_o',
        role: 'owner',
        user: { name: 'Olivia', email: 'o@spare.com', role: 'user' },
      },
      {
        role: 'employee',
        user: { name: 'Eve', email: 'e@spare.com', role: 'user' },
      },
      {
        role: 'admin',
        user: { name: 'Unsub', email: 'u@spare.com', role: 'user' },
      },
      // Platform admins are not org participants.
      {
        role: 'owner',
        user: { name: 'Staff', email: 's@comp.ai', role: 'admin' },
      },
    ]);
    (isUserUnsubscribed as jest.Mock).mockImplementation(
      async (_db, email: string, type: string) =>
        email === 'u@spare.com' && type === 'complianceDigest',
    );

    const result = await sendWeeklyComplianceDigests(
      new Date('2026-11-16T08:00:00Z'),
    );

    expect(result).toEqual({ organizations: 1, emails: 1 });
    expect(triggerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'o@spare.com',
        subject: 'Weekly compliance digest: 1 overdue, 0 due soon',
        idempotencyKey: 'weekly-compliance-digest:org_a:o@spare.com:2026-11-16',
      }),
    );
  });

  it('sends nothing when nothing needs attention', async () => {
    setup();
    mockDb.member.findMany.mockResolvedValue([owner('o@spare.com')]);
    (buildAttentionCards as jest.Mock).mockReturnValue([
      { label: 'Tasks', needsAttention: 0, href: '/tasks' },
    ]);
    (buildDeadlines as jest.Mock).mockReturnValue({
      ...deadlines,
      overdueCount: 0,
      overdue: [],
    });

    await sendWeeklyComplianceDigests(MONDAY);

    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('sends weekly subscribers only on Mondays and daily subscribers every day', async () => {
    setup();
    mockDb.member.findMany.mockResolvedValue([
      owner('weekly@spare.com'),
      owner('daily@spare.com', { complianceDigestFrequency: 'daily' }),
    ]);

    await sendWeeklyComplianceDigests(TUESDAY);
    expect(sentTo()).toEqual(['daily@spare.com']);
    expect(loadOverviewData).toHaveBeenCalledTimes(1);
    expect((triggerEmail as jest.Mock).mock.calls[0][0].subject).toMatch(
      /^Daily compliance digest/,
    );

    jest.clearAllMocks();
    setup();
    mockDb.member.findMany.mockResolvedValue([owner('weekly@spare.com')]);
    await sendWeeklyComplianceDigests(TUESDAY);
    // No recipient due today: the org data is not even loaded.
    expect(loadOverviewData).not.toHaveBeenCalled();
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('skips members who turned the compliance digest off', async () => {
    setup();
    mockDb.member.findMany.mockResolvedValue([owner('o@spare.com')]);
    (isUserUnsubscribed as jest.Mock).mockImplementation(
      async (_db, _email: string, type: string) => type === 'complianceDigest',
    );
    await sendWeeklyComplianceDigests(MONDAY);
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('folds the Monday task digest into the email when it is on', async () => {
    setup();
    mockDb.member.findMany.mockResolvedValue([owner('o@spare.com')]);
    await sendWeeklyComplianceDigests(MONDAY);
    const email = (triggerEmail as jest.Mock).mock.calls[0][0].react;
    expect(email.props.tasks).toEqual([
      { id: 't_mine', title: 'Mine' },
      { id: 't_free', title: 'Unassigned' },
    ]);

    jest.clearAllMocks();
    setup();
    mockDb.member.findMany.mockResolvedValue([owner('o@spare.com')]);
    (isUserUnsubscribed as jest.Mock).mockImplementation(
      async (_db, _email: string, type: string) => type === 'weeklyTaskDigest',
    );
    await sendWeeklyComplianceDigests(MONDAY);
    expect((triggerEmail as jest.Mock).mock.calls[0][0].react.props.tasks).toEqual([]);
  });

  it('reads the compliance digest frequency from email preferences', () => {
    expect(complianceDigestFrequency(null)).toBe('weekly');
    expect(complianceDigestFrequency({ complianceDigestFrequency: 'daily' })).toBe('daily');
    expect(complianceDigestFrequency({ digestFrequency: 'daily' })).toBe('weekly');
  });

  it('recognises owner and admin in multi-role strings', () => {
    expect(isDigestRecipient('employee, admin')).toBe(true);
    expect(isDigestRecipient('auditor')).toBe(false);
  });
});
