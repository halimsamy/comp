import { ForbiddenException } from '@nestjs/common';
import { db } from '@db';
import { IsmsRoleAssignmentService } from './isms-role-assignment.service';
import { IsmsRoleService } from './isms-role.service';
import { IsmsRequirementService } from './isms-requirement.service';

jest.mock('@db', () => {
  const db = {
    ismsDocument: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    ismsRole: { findFirst: jest.fn(), update: jest.fn() },
    ismsRoleAssignment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    ismsInterestedPartyRequirement: { findFirst: jest.fn(), update: jest.fn() },
    member: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
  };
  return { db };
});

const mockDb = jest.mocked(db);

beforeEach(() => {
  jest.clearAllMocks();
  (mockDb.ismsDocument.findUnique as jest.Mock).mockResolvedValue({ status: 'approved' });
});

describe('role acknowledgement (5.3 / PCI 12.4.1)', () => {
  const service = new IsmsRoleAssignmentService();

  beforeEach(() => {
    (mockDb.ismsRoleAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'ra_1',
      memberId: 'mem_holder',
      documentId: 'doc_1',
    });
  });

  it('lets the assignee acknowledge without reopening approval', async () => {
    await service.acknowledge({
      assignmentId: 'ra_1',
      organizationId: 'org_1',
      memberId: 'mem_holder',
    });
    expect(mockDb.ismsRoleAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'ra_1', role: { document: { organizationId: 'org_1' } } },
    });
    expect(mockDb.ismsRoleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'ra_1' },
      data: { acknowledgedAt: expect.any(Date), acknowledgedByMemberId: 'mem_holder' },
    });
    expect(mockDb.ismsDocument.update).not.toHaveBeenCalled();
  });

  it('refuses anyone else, including API-key calls with no member', async () => {
    await expect(
      service.acknowledge({ assignmentId: 'ra_1', organizationId: 'org_1', memberId: 'mem_admin' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.acknowledge({ assignmentId: 'ra_1', organizationId: 'org_1', memberId: undefined }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockDb.ismsRoleAssignment.update).not.toHaveBeenCalled();
  });
});

describe('role text changes reset acknowledgements', () => {
  const service = new IsmsRoleService();

  beforeEach(() => {
    (mockDb.ismsRole.findFirst as jest.Mock).mockResolvedValue({
      id: 'role_1',
      documentId: 'doc_1',
      name: 'SPO',
      responsibilities: 'Old',
      authorities: 'Old',
    });
  });

  it('clears acknowledgements when responsibilities change', async () => {
    await service.update({
      roleId: 'role_1',
      organizationId: 'org_1',
      dto: { responsibilities: 'New duties' },
    });
    expect(mockDb.ismsRoleAssignment.updateMany).toHaveBeenCalledWith({
      where: { roleId: 'role_1' },
      data: { acknowledgedAt: null, acknowledgedByMemberId: null },
    });
  });

  it('keeps acknowledgements for unrelated edits', async () => {
    await service.update({
      roleId: 'role_1',
      organizationId: 'org_1',
      dto: { requiredCompetence: 'ISO 27001 LA', responsibilities: 'Old' },
    });
    expect(mockDb.ismsRoleAssignment.updateMany).not.toHaveBeenCalled();
  });
});

describe('interested-party requirement owner and review date (4.2b)', () => {
  const service = new IsmsRequirementService();

  beforeEach(() => {
    (mockDb.ismsInterestedPartyRequirement.findFirst as jest.Mock).mockResolvedValue({
      id: 'req_1',
      documentId: 'doc_1',
    });
  });

  it('stores the owner and last review date', async () => {
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue({ id: 'mem_1' });
    await service.update({
      requirementId: 'req_1',
      organizationId: 'org_1',
      dto: { ownerMemberId: 'mem_1', lastReviewedAt: '2026-11-18' },
    });
    const { data } = (mockDb.ismsInterestedPartyRequirement.update as jest.Mock).mock
      .calls[0][0];
    expect(data.ownerMemberId).toBe('mem_1');
    expect(data.lastReviewedAt).toEqual(new Date('2026-11-18T00:00:00.000Z'));
  });

  it('rejects an owner who is not an active member', async () => {
    (mockDb.member.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.update({
        requirementId: 'req_1',
        organizationId: 'org_1',
        dto: { ownerMemberId: 'mem_x' },
      }),
    ).rejects.toThrow('Active member not found');
  });
});
