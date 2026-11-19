import { notifyPolicyApproval } from './policy-approval-notifier';

jest.mock('@db', () => ({
  db: {
    member: { findFirst: jest.fn() },
    policy: { findFirst: jest.fn() },
    policyVersion: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
  },
}));
jest.mock('@trycompai/email', () => ({ isUserUnsubscribed: jest.fn(async () => false) }));
jest.mock('../../email/trigger-email', () => ({ triggerEmail: jest.fn(async () => ({ id: 'e1' })) }));
jest.mock('../../email/templates/policy-approval-requested', () => ({
  PolicyApprovalRequestedEmail: jest.fn(() => null),
}));
const mockNovuTrigger = jest.fn();
jest.mock('../../notifications/novu.service', () => ({
  NovuService: jest.fn(() => ({ trigger: mockNovuTrigger })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { triggerEmail } = require('../../email/trigger-email');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isUserUnsubscribed } = require('@trycompai/email');

const approver = { user: { id: 'usr_appr', name: 'Ana', email: 'ana@acme.test' } };
const author = { user: { name: 'Bob', email: 'bob@acme.test' } };
const event = {
  kind: 'requested' as const,
  organizationId: 'org_1',
  policyId: 'pol_1',
  versionId: 'pv_2',
  recipientMemberId: 'mem_appr',
  actorMemberId: 'mem_author',
  idempotencyKey: 'policy-approval-requested:pv_2:mem_appr',
};

describe('notifyPolicyApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.member.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'mem_appr' ? approver : author),
    );
    db.policy.findFirst.mockResolvedValue({ name: 'Access Control' });
    db.policyVersion.findFirst.mockResolvedValue({ version: 2 });
    db.organization.findUnique.mockResolvedValue({ name: 'Acme' });
  });

  it('emails and notifies the approver in-app, scoped to the organization', async () => {
    await expect(notifyPolicyApproval(event)).resolves.toBe(true);
    expect(db.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_appr',
      organizationId: 'org_1',
      deactivated: false,
    });
    expect(triggerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@acme.test',
        subject: 'Approval requested: "Access Control"',
        idempotencyKey: 'policy-approval-requested:pv_2:mem_appr',
      }),
    );
    expect(mockNovuTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberId: 'usr_appr-org_1',
        payload: expect.objectContaining({ url: expect.stringContaining('/org_1/policies/pol_1') }),
      }),
    );
  });

  it('skips the email for unsubscribed approvers but keeps the in-app notice', async () => {
    isUserUnsubscribed.mockResolvedValueOnce(true);
    await notifyPolicyApproval(event);
    expect(triggerEmail).not.toHaveBeenCalled();
    expect(mockNovuTrigger).toHaveBeenCalled();
  });

  it('does not notify people about their own action', async () => {
    await expect(notifyPolicyApproval({ ...event, actorMemberId: 'mem_appr' })).resolves.toBe(false);
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('never throws when sending fails', async () => {
    triggerEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(notifyPolicyApproval(event)).resolves.toBe(false);
  });
});
