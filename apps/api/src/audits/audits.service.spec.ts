const mockDb = {
  auditEngagement: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  auditEngagementAuditor: { deleteMany: jest.fn(), createMany: jest.fn() },
  frameworkInstance: { findFirst: jest.fn() },
  member: { findMany: jest.fn() },
  requirementApplicability: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { AuditsService } from './audits.service';

const admin: AuthContext = {
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  memberId: 'mem_admin',
};

const auditRow = {
  id: 'aud_1',
  title: 'ISO 27001 surveillance',
  firmName: 'Acme CB',
  status: 'planned',
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-12-31'),
  accessEndsAt: null,
  createdAt: new Date(),
  frameworkInstanceId: 'frm_1',
  frameworkInstance: {
    id: 'frm_1',
    frameworkId: 'fw',
    customFrameworkId: null,
    currentVersionId: null,
    framework: { name: 'ISO 27001' },
    customFramework: null,
  },
  auditors: [
    { memberId: 'mem_aud', member: { user: { name: 'Ann', email: 'ann@cb.com', image: null } } },
  ],
  reviews: [{ requirementId: 'r1', status: 'accepted' }],
  requests: [{ status: 'open' }, { status: 'accepted' }],
};

describe('AuditsService', () => {
  const service = new AuditsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.requirementApplicability.findMany.mockResolvedValue([{ requirementKey: 'r2' }]);
    mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  });

  it('lists audits scoped to the org with progress over applicable requirements', async () => {
    mockDb.auditEngagement.findMany.mockResolvedValue([auditRow]);
    const [audit] = await service.list(admin);
    expect(mockDb.auditEngagement.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
    });
    expect(audit.frameworkName).toBe('ISO 27001');
    expect(audit.progress).toEqual({ total: 1, accepted: 1, flagged: 0, requested: 0, notReviewed: 0 });
    expect(audit.openRequests).toBe(1);
    expect(audit.auditors[0]).toMatchObject({ memberId: 'mem_aud', name: 'Ann' });
  });

  it('rejects a framework from another org', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        auth: admin,
        dto: { frameworkInstanceId: 'frm_x', title: 'A', periodStart: '2026-01-01', periodEnd: '2026-12-31' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockDb.frameworkInstance.findFirst.mock.calls[0][0].where).toEqual({
      id: 'frm_x',
      organizationId: 'org_1',
    });
  });

  it('only accepts members with the auditor role as auditors', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue({ id: 'frm_1' });
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_admin', role: 'admin' }]);
    await expect(
      service.create({
        auth: admin,
        dto: {
          frameworkInstanceId: 'frm_1',
          title: 'A',
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          auditorMemberIds: ['mem_admin'],
        },
      }),
    ).rejects.toThrow('auditor role');
  });

  it('creates an audit with an inclusive period and access end', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue({ id: 'frm_1' });
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_aud', role: 'auditor' }]);
    mockDb.auditEngagement.create.mockResolvedValue({ id: 'aud_1' });
    mockDb.auditEngagement.findFirst.mockResolvedValue({ ...auditRow });
    mockDb.auditEngagement.findFirstOrThrow.mockResolvedValue(auditRow);

    await service.create({
      auth: admin,
      dto: {
        frameworkInstanceId: 'frm_1',
        title: ' ISO ',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        accessEndsAt: '2027-01-31',
        auditorMemberIds: ['mem_aud'],
      },
    });
    const data = mockDb.auditEngagement.create.mock.calls[0][0].data;
    expect(data.title).toBe('ISO');
    expect(data.periodEnd.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    expect(data.accessEndsAt.toISOString()).toBe('2027-01-31T23:59:59.999Z');
    expect(data.auditors).toEqual({ create: [{ memberId: 'mem_aud' }] });
  });

  it('rejects a period that ends before it starts', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue({ id: 'frm_1' });
    await expect(
      service.create({
        auth: admin,
        dto: { frameworkInstanceId: 'frm_1', title: 'A', periodStart: '2026-12-01', periodEnd: '2026-01-01' },
      }),
    ).rejects.toThrow('start before it ends');
  });

  it('replaces auditors on update', async () => {
    mockDb.auditEngagement.findFirst.mockResolvedValue({ ...auditRow });
    mockDb.auditEngagement.findFirstOrThrow.mockResolvedValue(auditRow);
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_new', role: 'auditor' }]);
    await service.update({ auth: admin, auditId: 'aud_1', dto: { auditorMemberIds: ['mem_new'], status: 'in_progress' } });
    expect(mockDb.auditEngagement.update.mock.calls[0][0].data.status).toBe('in_progress');
    expect(mockDb.auditEngagementAuditor.deleteMany).toHaveBeenCalledWith({
      where: { auditId: 'aud_1', memberId: { notIn: ['mem_new'] } },
    });
    expect(mockDb.auditEngagementAuditor.createMany).toHaveBeenCalled();
  });

  it('404s for an audit outside the caller scope', async () => {
    mockDb.auditEngagement.findFirst.mockResolvedValue(null);
    await expect(service.remove({ auth: admin, auditId: 'aud_x' })).rejects.toThrow(NotFoundException);
    expect(mockDb.auditEngagement.delete).not.toHaveBeenCalled();
  });
});
