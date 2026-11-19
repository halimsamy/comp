const mockDb = {
  auditEngagement: { findMany: jest.fn(), update: jest.fn() },
  auditEngagementAuditor: { createMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@db', () => ({ db: mockDb }));

import type { AuthContext } from '../auth/types';
import { claimPendingAuditorAssignments, normalizeEmails } from './audit-pending-auditors';

const auth = (roles: string[]): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: roles,
  userEmail: 'Qsa@Firm.com',
  memberId: 'mem_qsa',
});

describe('pending auditor invitations (#109)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.auditEngagement.findMany.mockResolvedValue([
      { id: 'aud_1', pendingAuditorEmails: ['qsa@firm.com', 'other@firm.com'] },
    ]);
  });

  it('normalizes invited emails', () => {
    expect(normalizeEmails([' A@X.com', 'a@x.com', ''])).toEqual(['a@x.com']);
  });

  it('assigns a joined auditor to the audits that invited them', async () => {
    await claimPendingAuditorAssignments(auth(['auditor']));
    expect(mockDb.auditEngagement.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', pendingAuditorEmails: { has: 'qsa@firm.com' } },
      select: { id: true, pendingAuditorEmails: true },
    });
    expect(mockDb.auditEngagementAuditor.createMany).toHaveBeenCalledWith({
      data: [{ auditId: 'aud_1', memberId: 'mem_qsa' }],
      skipDuplicates: true,
    });
    expect(mockDb.auditEngagement.update).toHaveBeenCalledWith({
      where: { id: 'aud_1' },
      data: { pendingAuditorEmails: ['other@firm.com'] },
    });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('never assigns a member without the auditor role', async () => {
    await claimPendingAuditorAssignments(auth(['employee']));
    expect(mockDb.auditEngagement.findMany).not.toHaveBeenCalled();
  });
});
