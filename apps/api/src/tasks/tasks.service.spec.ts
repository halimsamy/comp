// Mock the DB layer before importing the service. We spread the real Prisma
// client so generated enums (TaskStatus, TaskFrequency) keep their values.
jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    member: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// checkAutoCompletePhases reaches into the DB; stub it out for unit tests.
jest.mock('../frameworks/frameworks-timeline.helper', () => ({
  checkAutoCompletePhases: jest.fn().mockResolvedValue(undefined),
}));

// The service's transitive imports pull in @trycompai/auth (ESM better-auth)
// which jest can't transform; stub it as the controller spec does.
jest.mock('@trycompai/auth', () => ({
  statement: {
    task: ['create', 'read', 'update', 'delete'],
    evidence: ['create', 'read', 'delete'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

import { Test } from '@nestjs/testing';
import { db, TaskFrequency, TaskStatus } from '@db';
import { TaskNotifierService } from './task-notifier.service';
import { TimelinesService } from '../timelines/timelines.service';
import { TasksService } from './tasks.service';

const taskFindFirst = db.task.findFirst as jest.Mock;
const taskUpdate = db.task.update as jest.Mock;
const taskUpdateMany = db.task.updateMany as jest.Mock;
const taskFindMany = db.task.findMany as jest.Mock;
const orgFindUnique = db.organization.findUnique as jest.Mock;
const memberFindFirst = db.member.findFirst as jest.Mock;
const auditLogCreate = db.auditLog.create as jest.Mock;

const ORG_ID = 'org_1';
const TASK_ID = 'tsk_1';
const USER_ID = 'usr_1';

// Builds the existingTask row updateTask() reads. evidenceApprovalEnabled is
// folded into the task's organization relation (a single query); pass null to
// simulate a missing organization row.
const existing = (
  approvalEnabled: boolean | null,
  overrides: Record<string, unknown> = {},
) => ({
  id: TASK_ID,
  title: 'Test task',
  status: TaskStatus.todo,
  assigneeId: null,
  approverId: null,
  frequency: null,
  organization:
    approvalEnabled === null
      ? null
      : { evidenceApprovalEnabled: approvalEnabled },
  ...overrides,
});

describe('TasksService approval gating', () => {
  let service: TasksService;

  const notifier = {
    notifyStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyAssigneeChange: jest.fn().mockResolvedValue(undefined),
    notifyBulkStatusChange: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TaskNotifierService, useValue: notifier },
        { provide: TimelinesService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TasksService);
    memberFindFirst.mockResolvedValue({ id: 'mem_actor', user: { role: 'owner' } });
    taskUpdate.mockResolvedValue({ id: TASK_ID });
    taskFindMany.mockResolvedValue([]);
    auditLogCreate.mockResolvedValue({});
  });

  const lastUpdateData = () => taskUpdate.mock.calls[0][0].data;

  describe('updateTask', () => {
    it('REGRESSION: approval OFF + stale approver allows todo→done and clears the approver', async () => {
      taskFindFirst.mockResolvedValue(existing(false, { approverId: 'mem_appr' }));

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(taskUpdate).toHaveBeenCalledTimes(1);
      expect(lastUpdateData().status).toBe(TaskStatus.done);
      expect(lastUpdateData().approverId).toBeNull();
    });

    it('PRESERVE: approval ON + approver assigned blocks a direct todo→done', async () => {
      taskFindFirst.mockResolvedValue(existing(true, { approverId: 'mem_appr' }));

      await expect(
        service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID),
      ).rejects.toThrow(
        'Cannot mark task as done directly when an approver is assigned. Submit for review instead.',
      );
      expect(taskUpdate).not.toHaveBeenCalled();
    });

    it('ALLOWED: approval ON + no approver allows todo→done', async () => {
      taskFindFirst.mockResolvedValue(existing(true, { approverId: null }));

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(taskUpdate).toHaveBeenCalledTimes(1);
      expect(lastUpdateData().status).toBe(TaskStatus.done);
    });

    it('SYMMETRIC: approval OFF lets an in_review task move to done and clears the approver', async () => {
      taskFindFirst.mockResolvedValue(
        existing(false, { status: TaskStatus.in_review, approverId: 'mem_appr' }),
      );

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(lastUpdateData().status).toBe(TaskStatus.done);
      expect(lastUpdateData().approverId).toBeNull();
    });

    it('IN_REVIEW LOCK: approval ON blocks moving an in_review task directly', async () => {
      taskFindFirst.mockResolvedValue(
        existing(true, { status: TaskStatus.in_review, approverId: 'mem_appr' }),
      );

      await expect(
        service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.todo }, USER_ID),
      ).rejects.toThrow('Cannot change status directly while task is in review');
      expect(taskUpdate).not.toHaveBeenCalled();
    });

    it('AUTOMATION REVIEW: approval ON lets a person finish an approver-less in_review task', async () => {
      taskFindFirst.mockResolvedValue(
        existing(true, { status: TaskStatus.in_review, approverId: null }),
      );

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(lastUpdateData().status).toBe(TaskStatus.done);
    });

    it('COMPLETION: done sets lastCompletedAt and reviewDate = next due date', async () => {
      taskFindFirst.mockResolvedValue(
        existing(false, { frequency: TaskFrequency.semiannually }),
      );

      const before = new Date();
      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      const data = lastUpdateData();
      expect(data.lastCompletedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      const months =
        (data.reviewDate.getFullYear() - before.getFullYear()) * 12 +
        data.reviewDate.getMonth() -
        before.getMonth();
      expect(months).toBe(6);
    });

    it('COMPLETION: re-saving an already-done task keeps its completion date', async () => {
      taskFindFirst.mockResolvedValue(existing(false, { status: TaskStatus.done }));

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(lastUpdateData().lastCompletedAt).toBeUndefined();
    });

    it('SELF-HEAL GUARD: an explicit approverId from the caller is not force-cleared', async () => {
      taskFindFirst.mockResolvedValue(existing(false, { approverId: 'mem_old' }));

      await service.updateTask(ORG_ID, TASK_ID, { approverId: 'mem_new' }, USER_ID);

      expect(lastUpdateData().approverId).toBe('mem_new');
    });

    it('NO-OP: approval OFF + no approver leaves approverId untouched on todo→done', async () => {
      taskFindFirst.mockResolvedValue(existing(false, { approverId: null }));

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(lastUpdateData().status).toBe(TaskStatus.done);
      expect(lastUpdateData().approverId).toBeUndefined();
    });

    it('DEFENSIVE: a missing organization row is treated as approval disabled', async () => {
      taskFindFirst.mockResolvedValue(existing(null, { approverId: 'mem_appr' }));

      await service.updateTask(ORG_ID, TASK_ID, { status: TaskStatus.done }, USER_ID);

      expect(lastUpdateData().status).toBe(TaskStatus.done);
      expect(lastUpdateData().approverId).toBeNull();
    });
  });

  describe('updateTasksStatus (bulk)', () => {
    it('approval OFF: bulk done does not exclude approver-assigned / in_review tasks', async () => {
      orgFindUnique.mockResolvedValue({ evidenceApprovalEnabled: false });
      taskUpdateMany.mockResolvedValue({ count: 1 });

      await service.updateTasksStatus(
        ORG_ID,
        [TASK_ID],
        TaskStatus.done,
        undefined,
        USER_ID,
      );

      const where = taskUpdateMany.mock.calls[0][0].where;
      expect(where).toEqual({ id: { in: [TASK_ID] }, organizationId: ORG_ID });
      expect(where.approverId).toBeUndefined();
      expect(where.status).toBeUndefined();
    });

    it('approval ON: bulk done excludes approver-assigned and in_review tasks', async () => {
      orgFindUnique.mockResolvedValue({ evidenceApprovalEnabled: true });
      taskUpdateMany.mockResolvedValue({ count: 1 });

      await service.updateTasksStatus(
        ORG_ID,
        [TASK_ID],
        TaskStatus.done,
        undefined,
        USER_ID,
      );

      const where = taskUpdateMany.mock.calls[0][0].where;
      expect(where.approverId).toBeNull();
      // Only approval reviews are locked; automation reviews (no approver) are not.
      expect(where.NOT).toEqual({ status: 'in_review', approverId: { not: null } });
    });

    it('bulk done sets each task\'s due date from its own frequency, when no date is sent', async () => {
      orgFindUnique.mockResolvedValue({ evidenceApprovalEnabled: false });
      taskUpdateMany.mockResolvedValue({ count: 2 });
      taskFindMany.mockResolvedValue([
        { id: 'tsk_q', frequency: TaskFrequency.quarterly },
        { id: 'tsk_y', frequency: TaskFrequency.yearly },
      ]);

      await service.updateTasksStatus(
        ORG_ID,
        ['tsk_q', 'tsk_y'],
        TaskStatus.done,
        undefined,
        USER_ID,
      );

      // 1 status update + 1 per distinct frequency
      expect(taskUpdateMany).toHaveBeenCalledTimes(3);
      const [, quarterly, yearly] = taskUpdateMany.mock.calls.map((c) => c[0]);
      expect(quarterly.where.id).toEqual({ in: ['tsk_q'] });
      expect(yearly.where.id).toEqual({ in: ['tsk_y'] });
      expect(yearly.data.lastCompletedAt).toBeInstanceOf(Date);
      const monthsAhead = (d: Date) =>
        (d.getFullYear() - new Date().getFullYear()) * 12 + d.getMonth() - new Date().getMonth();
      expect(monthsAhead(quarterly.data.reviewDate)).toBe(3);
      expect(monthsAhead(yearly.data.reviewDate)).toBe(12);
    });

    it('bulk open status leaves open tasks\' due dates alone', async () => {
      orgFindUnique.mockResolvedValue({ evidenceApprovalEnabled: false });
      taskUpdateMany.mockResolvedValue({ count: 1 });
      taskFindMany.mockResolvedValue([]);

      await service.updateTasksStatus(ORG_ID, [TASK_ID], TaskStatus.todo, undefined, USER_ID);

      expect(taskUpdateMany).toHaveBeenCalledTimes(1);
    });

    it('bulk reopening done work makes it due again in 30 days (#4)', async () => {
      orgFindUnique.mockResolvedValue({ evidenceApprovalEnabled: false });
      taskUpdateMany.mockResolvedValue({ count: 1 });
      taskFindMany.mockResolvedValue([{ id: TASK_ID }]);

      await service.updateTasksStatus(ORG_ID, [TASK_ID], TaskStatus.todo, undefined, USER_ID);

      expect(taskFindMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        status: { in: [TaskStatus.done, TaskStatus.not_relevant] },
      });
      const reopen = taskUpdateMany.mock.calls[1][0];
      expect(reopen.where).toEqual({ id: { in: [TASK_ID] }, organizationId: ORG_ID });
      const days = (reopen.data.reviewDate.getTime() - Date.now()) / 86_400_000;
      expect(Math.round(days)).toBe(30);
    });
  });

  describe('updateTasksAssignee', () => {
    it('SECURITY: rejects an assignee that is not a member of the organization', async () => {
      // A cross-org or non-existent member id makes the org-scoped lookup return
      // null; the guard must reject it rather than persist a foreign assignee.
      memberFindFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateTasksAssignee(ORG_ID, [TASK_ID], 'mem_other_org', USER_ID),
      ).rejects.toThrow('Assignee is not a member of this organization');
      expect(taskUpdateMany).not.toHaveBeenCalled();
    });
  });
});
