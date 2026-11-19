import { approvalReminderNumber, remindPendingPolicyApprovals } from './policy-approval-reminders';

jest.mock('@db', () => ({
  db: { policy: { findMany: jest.fn() }, policyVersion: { findMany: jest.fn() } },
}));
jest.mock('./policy-approval-notifier', () => ({
  notifyPolicyApproval: jest.fn(async () => true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notifyPolicyApproval } = require('./policy-approval-notifier');

const DAY = 24 * 60 * 60 * 1000;
const submittedAt = new Date('2026-11-01T08:00:00Z');
const after = (days: number) => new Date(submittedAt.getTime() + days * DAY + 60_000);

describe('approvalReminderNumber', () => {
  it('reminds on day 3, 6, 9 and never before', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((d) => approvalReminderNumber({ submittedAt, now: after(d) }))).toEqual([
      0, 0, 1, 0, 0, 2, 3,
    ]);
  });
});

describe('remindPendingPolicyApprovals', () => {
  it('notifies the approver once per reminder with a stable idempotency key', async () => {
    db.policy.findMany.mockResolvedValue([
      { id: 'pol_1', organizationId: 'org_1', approverId: 'mem_appr', pendingVersionId: 'pv_1' },
      { id: 'pol_2', organizationId: 'org_1', approverId: 'mem_appr', pendingVersionId: 'pv_2' },
    ]);
    db.policyVersion.findMany.mockResolvedValue([
      { id: 'pv_1', submittedAt, submittedById: 'mem_author' },
      { id: 'pv_2', submittedAt: after(-2), submittedById: 'mem_author' },
    ]);

    const result = await remindPendingPolicyApprovals(after(3));

    expect(result).toEqual({ pending: 2, reminded: 1 });
    expect(notifyPolicyApproval).toHaveBeenCalledTimes(1);
    expect(notifyPolicyApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'reminder',
        recipientMemberId: 'mem_appr',
        idempotencyKey: 'policy-approval-reminder:pv_1:mem_appr:1',
      }),
    );
  });
});
