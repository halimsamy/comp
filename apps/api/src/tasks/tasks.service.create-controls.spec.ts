jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    task: { create: jest.fn() },
    control: { findMany: jest.fn() },
    frameworkEditorTaskTemplate: { findUnique: jest.fn() },
  },
}));

jest.mock('../frameworks/frameworks-timeline.helper', () => ({
  checkAutoCompletePhases: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../controls/sync-framework-links', () => ({
  syncControlsToAllFrameworks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));

import { Test } from '@nestjs/testing';
import { db } from '@db';
import { syncControlsToAllFrameworks } from '../controls/sync-framework-links';
import { TaskNotifierService } from './task-notifier.service';
import { TimelinesService } from '../timelines/timelines.service';
import { TasksService } from './tasks.service';

const controlFindMany = db.control.findMany as jest.Mock;
const taskCreate = db.task.create as jest.Mock;

describe('TasksService.createTask control links', () => {
  let service: TasksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    taskCreate.mockResolvedValue({ id: 'tsk_1', title: 'T', description: 'D', status: 'todo' });
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TaskNotifierService, useValue: {} },
        { provide: TimelinesService, useValue: {} },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('links only controls of the org and fans them out to every framework', async () => {
    controlFindMany.mockResolvedValue([{ id: 'ctl_mine' }]);

    await service.createTask('org_1', {
      title: 'T',
      description: 'D',
      controlIds: ['ctl_mine', 'ctl_foreign'],
    });

    expect(controlFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['ctl_mine', 'ctl_foreign'] }, organizationId: 'org_1' },
      select: { id: true },
    });
    expect(taskCreate.mock.calls[0][0].data.controls).toEqual({
      connect: [{ id: 'ctl_mine' }],
    });
    expect(syncControlsToAllFrameworks).toHaveBeenCalledWith({
      controlIds: ['ctl_mine'],
      organizationId: 'org_1',
    });
  });

  it('skips control lookups when no controls are given', async () => {
    await service.createTask('org_1', { title: 'T', description: 'D' });

    expect(controlFindMany).not.toHaveBeenCalled();
    expect(taskCreate.mock.calls[0][0].data.controls).toBeUndefined();
  });
});
