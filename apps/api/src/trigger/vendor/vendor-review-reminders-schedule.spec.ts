import { db } from '@db';
import { vendorReviewRemindersSchedule } from './vendor-review-reminders-schedule';
import { resolveTaskCreatorAndAssignee } from './vendor-risk-assessment/assignee';

const runSchedule = (
  vendorReviewRemindersSchedule as unknown as {
    run: () => Promise<{ vendorsChecked: number; created: number }>;
  }
).run;

jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    vendor: { findMany: jest.fn() },
    taskItem: { findMany: jest.fn(), createMany: jest.fn() },
  },
}));

jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  schedules: { task: (config: unknown) => config },
}));

jest.mock('./vendor-risk-assessment/assignee', () => ({
  resolveTaskCreatorAndAssignee: jest.fn(),
}));

describe('vendorReviewRemindersSchedule', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse('2026-11-18T00:00:00.000Z') });
    jest.clearAllMocks();
    (resolveTaskCreatorAndAssignee as jest.Mock).mockResolvedValue({
      creatorMemberId: 'mem_admin',
      assigneeMemberId: 'mem_admin',
    });
  });

  afterEach(() => jest.useRealTimers());

  it('creates reminder tasks assigned to the vendor owner, skipping existing ones', async () => {
    (db.vendor.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'vnd_1',
        organizationId: 'org_1',
        assigneeId: 'mem_owner',
        criticality: 'high',
        handlesCardholderData: false,
        lastReviewedAt: new Date('2025-11-01T00:00:00Z'),
        nextReviewDue: new Date('2026-11-01T00:00:00Z'),
        contractEndDate: null,
        documents: [
          {
            type: 'soc2_type2',
            name: 'SOC 2',
            expiresAt: new Date('2026-12-01T00:00:00Z'),
          },
        ],
      },
      {
        id: 'vnd_2',
        organizationId: 'org_1',
        assigneeId: null,
        criticality: 'low',
        handlesCardholderData: false,
        lastReviewedAt: null,
        nextReviewDue: new Date('2026-11-10T00:00:00Z'),
        contractEndDate: null,
        documents: [],
      },
    ]);
    (db.taskItem.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ title: 'Complete periodic vendor review' }]);

    const result = await runSchedule();

    expect(result).toEqual({ vendorsChecked: 2, created: 2 });
    expect(db.taskItem.createMany).toHaveBeenCalledTimes(1);
    const { data } = (db.taskItem.createMany as jest.Mock).mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      title: 'Complete periodic vendor review',
      priority: 'high',
      entityId: 'vnd_1',
      entityType: 'vendor',
      organizationId: 'org_1',
      createdById: 'mem_admin',
      assigneeId: 'mem_owner',
    });
    expect(data[1].title).toBe('Request an updated SOC 2 Type II report');
  });
});
