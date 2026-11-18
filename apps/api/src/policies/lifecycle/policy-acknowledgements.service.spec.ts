import { PolicyAcknowledgementsService } from './policy-acknowledgements.service';
import { toAcknowledgementsCsv } from './acknowledgement-audience';

jest.mock('@db', () => ({
  db: {
    policy: { findFirst: jest.fn() },
    member: { findMany: jest.fn(), findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    policyAcknowledgement: { findMany: jest.fn() },
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

  it('reminds only pending members, once per day', async () => {
    const result = await service.remindPending({
      policyId: 'pol_1',
      organizationId: 'org_1',
    });
    expect(result).toEqual({ sent: 1, skipped: 0, pending: 1 });
    expect(triggerEmail).toHaveBeenCalledTimes(1);
    expect(triggerEmail.mock.calls[0][0]).toMatchObject({
      to: 'mem_b@acme.test',
      idempotencyKey: expect.stringContaining('policy-ack-reminder:pol_1:mem_b:'),
    });
  });

  it('skips unsubscribed members', async () => {
    isUserUnsubscribed.mockResolvedValueOnce(true);
    const result = await service.remindPending({
      policyId: 'pol_1',
      organizationId: 'org_1',
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('refuses reminders for drafts', async () => {
    db.policy.findFirst.mockResolvedValue({ ...policy, status: 'draft' });
    await expect(
      service.remindPending({ policyId: 'pol_1', organizationId: 'org_1' }),
    ).rejects.toThrow(/published/);
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

  it('exports a CSV scoped to the organization', async () => {
    const result = await service.exportCsv({
      organizationId: 'org_1',
      policyId: 'pol_1',
    });
    expect(db.policyAcknowledgement.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      policyId: 'pol_1',
    });
    expect(result.count).toBe(3);
    expect(result.csv.split('\n')[1]).toBe(
      '"Access Control","v2","mem_a","mem_a@acme.test","2026-10-02T00:00:00.000Z"',
    );
  });
});

describe('toAcknowledgementsCsv', () => {
  it('escapes quotes and neutralises spreadsheet formulas', () => {
    const csv = toAcknowledgementsCsv([
      {
        policyName: '=HYPERLINK("x")',
        version: null,
        memberName: 'A "B"',
        memberEmail: 'a@b.c',
        acknowledgedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(csv.split('\n')[1]).toBe(
      `"'=HYPERLINK(""x"")","","A ""B""","a@b.c","2026-01-01T00:00:00.000Z"`,
    );
  });
});
