import { PolicyAcknowledgementsService } from './policy-acknowledgements.service';
import { toAcknowledgementsCsv } from './acknowledgement-audience';

jest.mock('@db', () => ({
  db: {
    policy: { findFirst: jest.fn(), findMany: jest.fn() },
    member: { findMany: jest.fn(), findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    policyAcknowledgement: { findMany: jest.fn() },
    policyAckReminder: { groupBy: jest.fn(), findMany: jest.fn(), create: jest.fn() },
  },
  PolicyStatus: { draft: 'draft', published: 'published' },
}));
jest.mock('../../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(async (members: unknown[]) => members),
}));
jest.mock('@trycompai/email', () => ({
  isUserUnsubscribed: jest.fn(async () => false),
  PolicyNotificationEmail: jest.fn(() => null),
}));
jest.mock('../../email/trigger-email', () => ({
  triggerEmail: jest.fn(async () => ({ id: 'run_1' })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { triggerEmail } = require('../../email/trigger-email');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isUserUnsubscribed } = require('@trycompai/email');

const policy = {
  id: 'pol_1',
  name: 'Access Control',
  status: 'published',
  lastPublishedAt: new Date('2026-10-01'),
  signedBy: ['mem_a'],
  isRequiredToSign: true,
  visibility: 'ALL',
  visibleToDepartments: [],
  currentVersionId: 'pv_2',
  currentVersion: { id: 'pv_2', version: 2 },
};
const member = (id: string, department = 'it') => ({
  id,
  role: 'employee',
  department,
  user: { id: `usr_${id}`, name: id, email: `${id}@acme.test`, role: null },
});
const ack = (memberId: string, version: number, at: string) => ({
  id: `pak_${memberId}_${version}`,
  policyId: 'pol_1',
  memberId,
  policyVersionId: `pv_${version}`,
  acknowledgedAt: new Date(at),
  member: { id: memberId, user: { name: memberId, email: `${memberId}@acme.test` } },
  policyVersion: { id: `pv_${version}`, version },
  policy: { id: 'pol_1', name: 'Access Control' },
});

describe('PolicyAcknowledgementsService', () => {
  const service = new PolicyAcknowledgementsService();

  beforeEach(() => {
    jest.clearAllMocks();
    db.policy.findFirst.mockResolvedValue(policy);
    db.member.findMany.mockResolvedValue([member('mem_a'), member('mem_b')]);
    db.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    db.policyAckReminder.groupBy.mockResolvedValue([]);
    db.policyAckReminder.findMany.mockResolvedValue([]);
    db.policyAckReminder.create.mockResolvedValue({});
    db.policy.findMany.mockResolvedValue([
      {
        ...policy,
        assignee: { user: { name: 'Olivia Owner', email: 'o@acme.test' } },
        currentVersion: {
          version: 2,
          approvedAt: new Date('2026-10-01T00:00:00Z'),
          approvedBy: { user: { name: 'Ana Approver', email: 'a@acme.test' } },
        },
      },
    ]);
    db.policyAcknowledgement.findMany.mockResolvedValue([
      ack('mem_a', 2, '2026-10-02'),
      ack('mem_b', 1, '2026-01-05'),
      ack('mem_a', 1, '2026-01-04'),
    ]);
  });

  it('shows who acknowledged the current version and keeps older history', async () => {
    const result = await service.listForPolicy({
      policyId: 'pol_1',
      organizationId: 'org_1',
    });

    expect(result.summary).toEqual({ total: 2, acknowledged: 1, pending: 1 });
    expect(result.members).toEqual([
      expect.objectContaining({
        memberId: 'mem_a',
        status: 'acknowledged',
        acknowledgedAt: new Date('2026-10-02'),
      }),
      expect.objectContaining({
        memberId: 'mem_b',
        status: 'pending',
        acknowledgedAt: null,
        lastAcknowledgedVersion: 1,
      }),
    ]);
    expect(result.history).toHaveLength(3);
  });

  it('only counts members of the departments a policy is visible to', async () => {
    db.policy.findFirst.mockResolvedValue({
      ...policy,
      visibility: 'DEPARTMENT',
      visibleToDepartments: ['hr'],
    });
    db.member.findMany.mockResolvedValue([member('mem_a', 'hr'), member('mem_b')]);
    const result = await service.listForPolicy({
      policyId: 'pol_1',
      organizationId: 'org_1',
    });
    expect(result.members.map((m) => m.memberId)).toEqual(['mem_a']);
  });

  it('reports the last reminder per member and whether a version is in force', async () => {
    const remindedAt = new Date('2026-11-17T09:00:00Z');
    db.policyAckReminder.groupBy.mockResolvedValue([
      { memberId: 'mem_b', _max: { sentAt: remindedAt } },
    ]);
    const result = await service.listForPolicy({ policyId: 'pol_1', organizationId: 'org_1' });
    expect(result.inForce).toBe(true);
    expect(result.members.find((m) => m.memberId === 'mem_b')?.lastRemindedAt).toEqual(remindedAt);
  });

  it('treats a never-approved policy as not in force', async () => {
    db.policy.findFirst.mockResolvedValue({ ...policy, status: 'needs_review', lastPublishedAt: null });
    const result = await service.listForPolicy({ policyId: 'pol_1', organizationId: 'org_1' });
    expect(result.inForce).toBe(false);
  });

  it('reminds only pending members and records the reminder', async () => {
    const now = new Date('2026-11-18T10:00:00Z');
    const result = await service.remindPending({ policyId: 'pol_1', organizationId: 'org_1', now });
    expect(result).toEqual({ sent: 1, alreadyRemindedToday: 0, unsubscribed: 0, failed: 0, pending: 1 });
    expect(triggerEmail).toHaveBeenCalledTimes(1);
    expect(triggerEmail.mock.calls[0][0]).toMatchObject({
      to: 'mem_b@acme.test',
      idempotencyKey: 'policy-ack-reminder:pol_1:mem_b:2026-11-18',
    });
    expect(db.policyAckReminder.create).toHaveBeenCalledWith({
      data: { policyId: 'pol_1', memberId: 'mem_b', policyVersionId: 'pv_2', sentAt: now },
    });
  });

  it('does not remind a member twice on the same UTC day', async () => {
    db.policyAckReminder.findMany.mockResolvedValue([{ memberId: 'mem_b' }]);
    const now = new Date('2026-11-18T22:00:00Z');
    const result = await service.remindPending({ policyId: 'pol_1', organizationId: 'org_1', now });
    expect(result).toMatchObject({ sent: 0, alreadyRemindedToday: 1 });
    expect(db.policyAckReminder.findMany.mock.calls[0][0].where).toEqual({
      policyId: 'pol_1',
      sentAt: { gte: new Date('2026-11-18T00:00:00Z') },
    });
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('skips unsubscribed members', async () => {
    isUserUnsubscribed.mockResolvedValueOnce(true);
    const result = await service.remindPending({ policyId: 'pol_1', organizationId: 'org_1' });
    expect(result).toMatchObject({ sent: 0, unsubscribed: 1 });
    expect(db.policyAckReminder.create).not.toHaveBeenCalled();
  });

  it('refuses reminders until a version is approved', async () => {
    db.policy.findFirst.mockResolvedValue({ ...policy, status: 'draft', lastPublishedAt: null });
    await expect(
      service.remindPending({ policyId: 'pol_1', organizationId: 'org_1' }),
    ).rejects.toThrow(/approved and published/);
    expect(triggerEmail).not.toHaveBeenCalled();
  });

  it('does not leak members of other organizations', async () => {
    db.member.findFirst.mockResolvedValue(null);
    await expect(
      service.listForMember({ memberId: 'mem_x', organizationId: 'org_1' }),
    ).rejects.toThrow(/not found/);
    expect(db.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_x',
      organizationId: 'org_1',
    });
  });

  it('requires a memberId for the member history', async () => {
    await expect(
      service.listForMember({ memberId: '', organizationId: 'org_1' }),
    ).rejects.toThrow(/memberId/);
  });

  it('exports one CSV row per audience member, including who has not signed', async () => {
    const result = await service.exportCsv({ organizationId: 'org_1', policyId: 'pol_1' });
    expect(db.policy.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      id: 'pol_1',
    });
    expect(db.policyAcknowledgement.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
    });
    expect(result.count).toBe(2);
    const [, signed, outdated] = result.csv.split('\n');
    expect(signed).toContain(
      '"Access Control","mem_a","mem_a@acme.test","it","employee","Acknowledged","v2","v2","2026-10-02T00:00:00.000Z"',
    );
    expect(signed).toContain('"Olivia Owner","Ana Approver"');
    expect(outdated).toContain('"mem_b","mem_b@acme.test","it","employee","Outdated","v2","v1"');
  });

  it('marks members without any acknowledgement as pending', async () => {
    db.policyAcknowledgement.findMany.mockResolvedValue([]);
    const result = await service.exportCsv({ organizationId: 'org_1', policyId: 'pol_1' });
    expect(result.csv.split('\n')[2]).toContain('"Pending"');
  });
});

describe('toAcknowledgementsCsv', () => {
  it('escapes quotes and neutralises spreadsheet formulas', () => {
    const csv = toAcknowledgementsCsv([
      {
        policyName: '=HYPERLINK("x")',
        memberName: 'A "B"',
        memberEmail: 'a@b.c',
        department: 'it',
        role: 'employee',
        status: 'Acknowledged',
        currentVersion: null,
        acknowledgedVersion: null,
        acknowledgedAt: new Date('2026-01-01T00:00:00Z'),
        lastRemindedAt: null,
        owner: '',
        approvedBy: '',
        approvedAt: null,
      },
    ]);
    expect(csv.split('\n')[1].startsWith(`"'=HYPERLINK(""x"")","A ""B""","a@b.c"`)).toBe(true);
  });
});
