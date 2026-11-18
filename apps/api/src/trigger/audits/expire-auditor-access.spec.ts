const mockDb = { auditEngagementAuditor: { findMany: jest.fn() } };
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn() },
  schedules: { task: (config: unknown) => config },
}));
const mockDeactivate = jest.fn();
jest.mock('../../people/utils/member-deactivation', () => ({
  deactivateMember: (...args: unknown[]) => mockDeactivate(...args),
}));

import { expireAuditorAccess } from './expire-auditor-access';

const now = new Date('2026-11-18T01:00:00Z');
const ended = { audit: { accessEndsAt: new Date('2026-11-17T23:59:59Z') } };
const open = { audit: { accessEndsAt: new Date('2027-01-31T23:59:59Z') } };
const grant = (id: string, role: string, auditGrants: unknown[]) => ({
  member: { id, role, userId: `usr_${id}`, organizationId: 'org_1', auditGrants },
});

describe('expireAuditorAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deactivates auditor-only members once every audit access has ended', async () => {
    mockDb.auditEngagementAuditor.findMany.mockResolvedValue([
      grant('a', 'auditor', [ended]),
      grant('b', 'auditor', [ended, open]),
      grant('c', 'auditor,admin', [ended]),
    ]);
    const result = await expireAuditorAccess(now);
    expect(mockDb.auditEngagementAuditor.findMany.mock.calls[0][0].where).toEqual({
      audit: { accessEndsAt: { lt: now } },
      member: { deactivated: false },
    });
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).toHaveBeenCalledWith({
      memberId: 'a',
      organizationId: 'org_1',
      userId: 'usr_a',
      skipOffboarding: true,
    });
    expect(result).toEqual({ checked: 3, deactivated: 1 });
  });

  it('keeps members with an open-ended audit', async () => {
    mockDb.auditEngagementAuditor.findMany.mockResolvedValue([
      grant('a', 'auditor', [ended, { audit: { accessEndsAt: null } }]),
    ]);
    await expireAuditorAccess(now);
    expect(mockDeactivate).not.toHaveBeenCalled();
  });
});
