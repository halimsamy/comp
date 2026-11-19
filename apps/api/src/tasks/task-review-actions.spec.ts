import { BadRequestException, NotFoundException } from '@nestjs/common';

const tx = { task: { update: jest.fn() }, auditLog: { create: jest.fn() } };
const mockDb = {
  task: { findFirst: jest.fn(), updateMany: jest.fn() },
  member: { findFirst: jest.fn() },
  attachment: { findMany: jest.fn(), update: jest.fn((args: unknown) => args) },
  $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]))),
};
jest.mock('@db', () => ({
  db: mockDb,
  TaskStatus: { todo: 'todo', in_review: 'in_review', done: 'done', not_relevant: 'not_relevant' },
}));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { TaskReviewActionsController } from './task-review-actions.controller';
import { setTaskAttachmentsValidity, setTaskDueDates, withdrawReviewRequest } from './task-review-actions';

beforeEach(() => jest.clearAllMocks());

describe('setTaskDueDates', () => {
  it('sets reviewDate on the org’s open tasks', async () => {
    mockDb.task.updateMany.mockResolvedValue({ count: 2 });
    expect(await setTaskDueDates({ organizationId: 'org_1', taskIds: ['a', 'b'], dueDate: '2026-12-31' })).toEqual({ updatedCount: 2 });
    expect(mockDb.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, organizationId: 'org_1', archivedAt: null },
      data: { reviewDate: new Date('2026-12-31T00:00:00.000Z') },
    });
  });

  it('rejects when no task of the org matched', async () => {
    mockDb.task.updateMany.mockResolvedValue({ count: 0 });
    await expect(setTaskDueDates({ organizationId: 'org_1', taskIds: ['x'], dueDate: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('withdrawReviewRequest (#44)', () => {
  const inReview = { id: 'tsk_1', title: 'T', status: 'in_review', previousStatus: 'in_progress', approverId: 'mem_a' };

  it('reverts the status, keeps the approver and logs one withdrawal', async () => {
    mockDb.task.findFirst.mockResolvedValue(inReview);
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_me' });
    await withdrawReviewRequest({ organizationId: 'org_1', taskId: 'tsk_1', userId: 'usr_1' });
    const data = tx.task.update.mock.calls[0][0].data;
    expect(data).toEqual({ status: 'in_progress', previousStatus: null, approvedAt: null });
    expect(data).not.toHaveProperty('approverId');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      description: 'withdrew the review request',
      data: expect.objectContaining({ action: 'review_withdrawn' }),
    });
  });

  it('refuses tasks without an open review request, and other orgs’ tasks', async () => {
    mockDb.task.findFirst.mockResolvedValue({ ...inReview, approverId: null });
    await expect(withdrawReviewRequest({ organizationId: 'org_1', taskId: 'tsk_1', userId: 'u' })).rejects.toBeInstanceOf(BadRequestException);
    mockDb.task.findFirst.mockResolvedValue(null);
    await expect(withdrawReviewRequest({ organizationId: 'org_2', taskId: 'tsk_1', userId: 'u' })).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.task.findFirst.mock.calls[1][0].where).toMatchObject({ organizationId: 'org_2' });
  });
});

describe('setTaskAttachmentsValidity (#107)', () => {
  it('updates every file of the task and skips ones that start after the end', async () => {
    mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_1' });
    mockDb.attachment.findMany.mockResolvedValue([
      { id: 'att_1', createdAt: new Date('2026-01-01'), validFrom: null },
      { id: 'att_2', createdAt: new Date('2026-11-01'), validFrom: new Date('2026-11-01') },
    ]);
    const result = await setTaskAttachmentsValidity({ organizationId: 'org_1', taskId: 'tsk_1', validUntil: '2026-06-30' });
    expect(result).toEqual({ updatedCount: 1, skippedCount: 1 });
    expect(mockDb.attachment.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1', entityType: 'task', entityId: 'tsk_1' });
    expect(mockDb.attachment.update).toHaveBeenCalledWith({
      where: { id: 'att_1' },
      data: { validFrom: new Date('2026-01-01'), validUntil: new Date('2026-06-30T00:00:00.000Z') },
    });
  });
});

describe('TaskReviewActionsController permissions', () => {
  const required = (method: keyof TaskReviewActionsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, TaskReviewActionsController.prototype[method]);

  it('needs task:update for due dates and withdrawals, evidence:update for file validity', () => {
    expect(required('setDueDates')).toEqual([{ resource: 'task', actions: ['update'] }]);
    expect(required('withdrawReview')).toEqual([{ resource: 'task', actions: ['update'] }]);
    expect(required('setAttachmentsValidity')).toEqual([{ resource: 'evidence', actions: ['update'] }]);
    expect(required('listForms')).toEqual([{ resource: 'task', actions: ['read'] }]);
  });
});
