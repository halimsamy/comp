import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  control: { findMany: jest.fn(), updateMany: jest.fn() },
  member: { findFirst: jest.fn() },
  task: { updateMany: jest.fn() },
  policy: { updateMany: jest.fn() },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb, Prisma: {}, EvidenceFormType: {} }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
// Read-only auditors hold control:read only; admins hold control:update.
jest.mock('@trycompai/auth', () => ({
  statement: { control: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {
    admin: { control: ['create', 'read', 'update', 'delete'] },
    auditor: { control: ['read'] },
  },
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { ControlsBulkOwnerService } from './controls-bulk-owner.service';
import { ControlsMappingController } from './controls-mapping.controller';

const service = new ControlsBulkOwnerService();
const control = (id: string, extra: Partial<Record<string, unknown>> = {}) => ({
  id,
  tasks: [],
  policies: [],
  frameworkTaskLinks: [],
  frameworkPolicyLinks: [],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.control.updateMany.mockResolvedValue({ count: 2 });
  mockDb.task.updateMany.mockResolvedValue({ count: 0 });
  mockDb.policy.updateMany.mockResolvedValue({ count: 0 });
  mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1' });
});

describe('PATCH /v1/controls/bulk-owner permissions', () => {
  const required = Reflect.getMetadata(PERMISSIONS_KEY, ControlsMappingController.prototype.bulkOwner);

  it('requires control:update', () => {
    expect(required).toEqual([{ resource: 'control', actions: ['update'] }]);
  });

});

describe('ControlsBulkOwnerService', () => {
  it('sets the owner of every control, scoped to the organization', async () => {
    mockDb.control.findMany.mockResolvedValue([control('ctl_1'), control('ctl_2')]);
    const result = await service.setOwner({
      organizationId: 'org_1',
      dto: { controlIds: ['ctl_1', 'ctl_2', 'ctl_1'], ownerId: 'mem_1' },
    });
    expect(mockDb.control.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['ctl_1', 'ctl_2'] },
      organizationId: 'org_1',
      archivedAt: null,
    });
    expect(mockDb.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_1',
      organizationId: 'org_1',
      deactivated: false,
    });
    expect(mockDb.control.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ctl_1', 'ctl_2'] }, organizationId: 'org_1' },
      data: { ownerId: 'mem_1' },
    });
    expect(result).toEqual({ controls: 2, tasks: 0, policies: 0 });
  });

  it('assigns only unassigned linked tasks and policies when asked', async () => {
    mockDb.control.findMany.mockResolvedValue([
      control('ctl_1', {
        tasks: [{ id: 'tsk_1' }],
        frameworkTaskLinks: [{ taskId: 'tsk_1' }, { taskId: 'tsk_2' }],
        policies: [{ id: 'pol_1' }],
      }),
    ]);
    await service.setOwner({
      organizationId: 'org_1',
      dto: { controlIds: ['ctl_1'], ownerId: 'mem_1', assignLinkedWork: true },
    });
    expect(mockDb.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tsk_1', 'tsk_2'] }, organizationId: 'org_1', assigneeId: null },
      data: { assigneeId: 'mem_1' },
    });
    expect(mockDb.policy.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['pol_1'] }, organizationId: 'org_1', assigneeId: null },
      data: { assigneeId: 'mem_1' },
    });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('clears owners without touching linked work', async () => {
    mockDb.control.findMany.mockResolvedValue([control('ctl_1')]);
    await service.setOwner({ organizationId: 'org_1', dto: { controlIds: ['ctl_1'], ownerId: null } });
    expect(mockDb.member.findFirst).not.toHaveBeenCalled();
    expect(mockDb.control.updateMany.mock.calls[0][0].data).toEqual({ ownerId: null });
    expect(mockDb.task.updateMany.mock.calls[0][0].where.id).toEqual({ in: [] });
  });

  it('rejects controls from another organization', async () => {
    mockDb.control.findMany.mockResolvedValue([control('ctl_1')]);
    await expect(
      service.setOwner({ organizationId: 'org_1', dto: { controlIds: ['ctl_1', 'ctl_x'], ownerId: 'mem_1' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.control.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an owner outside the organization', async () => {
    mockDb.control.findMany.mockResolvedValue([control('ctl_1')]);
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      service.setOwner({ organizationId: 'org_1', dto: { controlIds: ['ctl_1'], ownerId: 'mem_x' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('needs an owner to assign linked work', async () => {
    mockDb.control.findMany.mockResolvedValue([control('ctl_1')]);
    await expect(
      service.setOwner({
        organizationId: 'org_1',
        dto: { controlIds: ['ctl_1'], ownerId: null, assignLinkedWork: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
