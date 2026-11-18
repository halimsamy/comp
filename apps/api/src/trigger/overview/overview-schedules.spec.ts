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
import { triggerEmail } from '../../email/trigger-email';
import { recordComplianceSnapshots } from '../../overview/compliance-snapshots';
import { buildAttentionCards } from '../../overview/overview-attention';
import { buildDeadlines } from '../../overview/overview-deadlines';
import { recordComplianceSnapshotsForAllOrgs } from './compliance-snapshot-schedule';
import {
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
  };

  it('emails subscribed owners and admins only', async () => {
    mockDb.organization.findMany.mockResolvedValue([
      { id: 'org_a', name: 'Spare', isInternal: false },
    ]);
    (buildAttentionCards as jest.Mock).mockReturnValue([
      { label: 'Tasks', needsAttention: 1, href: '/tasks' },
    ]);
    (buildDeadlines as jest.Mock).mockReturnValue(deadlines);
    mockDb.member.findMany.mockResolvedValue([
      {
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
      async (_db, email: string) => email === 'u@spare.com',
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
    mockDb.organization.findMany.mockResolvedValue([
      { id: 'org_a', name: 'Spare', isInternal: false },
    ]);
    (buildAttentionCards as jest.Mock).mockReturnValue([
      { label: 'Tasks', needsAttention: 0, href: '/tasks' },
    ]);
    (buildDeadlines as jest.Mock).mockReturnValue({
      ...deadlines,
      overdueCount: 0,
      overdue: [],
    });

    await sendWeeklyComplianceDigests();

    expect(mockDb.member.findMany).not.toHaveBeenCalled();
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('recognises owner and admin in multi-role strings', () => {
    expect(isDigestRecipient('employee, admin')).toBe(true);
    expect(isDigestRecipient('auditor')).toBe(false);
  });
});
