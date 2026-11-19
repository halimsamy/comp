import { NotFoundException } from '@nestjs/common';

const mockDb = {
  member: { findFirst: jest.fn() },
  trainingModule: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  trainingCompletionRecord: { findMany: jest.fn(), create: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

import { assignedModulesWhere, TrainingModulesService } from './training-modules.service';

describe('TrainingModulesService', () => {
  const service = new TrainingModulesService();
  const member = { id: 'mem_1', role: 'employee, admin', department: 'it' };

  beforeEach(() => jest.clearAllMocks());

  it('targets modules by any of the member roles and their department', () => {
    const where = assignedModulesWhere({
      organizationId: 'org_1',
      role: 'employee, admin',
      department: 'it',
    });
    expect(where).toMatchObject({ organizationId: 'org_1', isEnabled: true });
    expect(JSON.stringify(where)).toContain('"hasSome":["employee","admin"]');
    expect(JSON.stringify(where)).toContain('"has":"it"');
  });

  it('targets custom departments too', () => {
    const where = assignedModulesWhere({
      organizationId: 'org_1',
      role: 'employee',
      department: 'ENGINEERING',
    });
    expect(JSON.stringify(where)).toContain('"has":"ENGINEERING"');
  });

  it('reports completed, expired and not started modules', async () => {
    const now = new Date('2026-11-18');
    mockDb.member.findFirst.mockResolvedValue(member);
    mockDb.trainingModule.findMany.mockResolvedValue([
      { id: 'trm_a' },
      { id: 'trm_b' },
      { id: 'trm_c' },
    ]);
    mockDb.trainingCompletionRecord.findMany.mockResolvedValue([
      { moduleId: 'trm_a', completedAt: new Date('2026-06-01'), expiresAt: new Date('2027-06-01') },
      { moduleId: 'trm_b', completedAt: new Date('2025-06-01'), expiresAt: new Date('2026-06-01') },
    ]);

    const result = await service.getMemberModules({ organizationId: 'org_1', memberId: 'mem_1', now });

    expect(result.map((m) => m.status)).toEqual(['completed', 'expired', 'not_started']);
    expect(mockDb.trainingCompletionRecord.findMany.mock.calls[0][0].where.organizationId).toBe('org_1');
  });

  it('records a completion with the module recurrence as expiry', async () => {
    mockDb.member.findFirst.mockResolvedValue(member);
    mockDb.trainingModule.findFirst.mockResolvedValue({ id: 'trm_a', recurrenceMonths: 6 });
    mockDb.trainingCompletionRecord.create.mockImplementation(({ data }) => data);

    const completedAt = new Date('2026-01-15T00:00:00Z');
    const record = await service.completeModule({
      organizationId: 'org_1',
      memberId: 'mem_1',
      moduleId: 'trm_a',
      completedAt,
    });

    expect(record.expiresAt.toISOString().slice(0, 7)).toBe('2026-07');
  });

  it('refuses modules not assigned to the member', async () => {
    mockDb.member.findFirst.mockResolvedValue(member);
    mockDb.trainingModule.findFirst.mockResolvedValue(null);
    await expect(
      service.completeModule({ organizationId: 'org_1', memberId: 'mem_1', moduleId: 'trm_x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses members from another organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      service.getMemberModules({ organizationId: 'org_2', memberId: 'mem_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disables instead of deleting so history is kept', async () => {
    mockDb.trainingModule.findFirst.mockResolvedValue({ id: 'trm_a' });
    await service.disable({ organizationId: 'org_1', moduleId: 'trm_a' });
    expect(mockDb.trainingModule.update).toHaveBeenCalledWith({
      where: { id: 'trm_a' },
      data: { isEnabled: false },
    });
  });
});
