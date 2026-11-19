const mockDb = {
  auditEngagement: { findFirst: jest.fn() },
  auditEvidenceRequest: { createMany: jest.fn() },
  frameworkInstance: { findFirstOrThrow: jest.fn() },
  member: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../notifications/ownership-notifier.service', () => ({ OwnershipNotifier: class {} }));
jest.mock('./audit-scope', () => ({
  auditFrameworkSelect: {},
  loadAuditRequirements: jest.fn().mockResolvedValue({
    requirements: [{ id: 'req_1' }],
    notApplicable: new Set(),
  }),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { AuditTeamRequestsService } from './audit-team-requests.service';

const auth = (roles: string[]): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: roles,
  userId: 'usr_admin',
  memberId: 'mem_admin',
});

describe('AuditTeamRequestsService (#109)', () => {
  const ownership = { notify: jest.fn().mockResolvedValue(true) };
  const service = new AuditTeamRequestsService(ownership as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.auditEngagement.findFirst.mockResolvedValue({
      id: 'aud_1',
      frameworkInstanceId: 'frm_1',
      auditors: [],
    });
    mockDb.frameworkInstance.findFirstOrThrow.mockResolvedValue({ id: 'frm_1' });
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_owner' }]);
    mockDb.auditEvidenceRequest.createMany.mockImplementation(({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
  });

  it('logs an imported request list as team requests and notifies owners', async () => {
    const result = await service.create({
      auth: auth(['admin']),
      auditId: 'aud_1',
      requests: [
        { title: ' Population of leavers ', requirementId: 'req_1', dueDate: '2026-12-01', ownerMemberId: 'mem_owner' },
        { title: 'Firewall config' },
      ],
    });

    expect(result).toEqual({ count: 2 });
    const { data } = mockDb.auditEvidenceRequest.createMany.mock.calls[0][0];
    expect(data[0]).toMatchObject({
      auditId: 'aud_1',
      source: 'team',
      title: 'Population of leavers',
      requirementId: 'req_1',
      ownerMemberId: 'mem_owner',
    });
    expect(data[1]).toMatchObject({ source: 'team', requirementId: null, ownerMemberId: null });
    expect(ownership.notify).toHaveBeenCalledTimes(1);
    expect(ownership.notify).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'mem_owner', url: '/audits/aud_1?tab=requests' }),
    );
  });

  it('rejects a requirement outside the audit', async () => {
    await expect(
      service.create({ auth: auth(['admin']), auditId: 'aud_1', requests: [{ title: 'x', requirementId: 'req_other' }] }),
    ).rejects.toThrow(BadRequestException);
    expect(mockDb.auditEvidenceRequest.createMany).not.toHaveBeenCalled();
  });

  it('rejects an owner outside the organization', async () => {
    mockDb.member.findMany.mockResolvedValue([]);
    await expect(
      service.create({ auth: auth(['admin']), auditId: 'aud_1', requests: [{ title: 'x', ownerMemberId: 'mem_x' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('is not for auditor-only members', async () => {
    await expect(
      service.create({ auth: auth(['auditor']), auditId: 'aud_1', requests: [{ title: 'x' }] }),
    ).rejects.toThrow(ForbiddenException);
  });
});
