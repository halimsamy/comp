const mockDb = {
  risk: { findMany: jest.fn(), create: jest.fn() },
  taskItem: { findMany: jest.fn(), create: jest.fn() },
  requirementMap: { findMany: jest.fn() },
  $transaction: jest.fn((run: (tx: unknown) => Promise<unknown>) => run(mockDb)),
};
jest.mock('@db', () => ({ db: mockDb, Prisma: {} }));

import { RISK_LIBRARY } from './risk-library';
import { isActionOverdue, RiskWorkspaceService } from './risk-workspace.service';

const ORG = 'org_1';

describe('RiskWorkspaceService', () => {
  const service = new RiskWorkspaceService();
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.requirementMap.findMany.mockResolvedValue([]);
  });

  it('flags library templates already in the register (case-insensitive)', async () => {
    const first = RISK_LIBRARY[0];
    mockDb.risk.findMany.mockResolvedValue([{ title: ` ${first.title.toUpperCase()} ` }]);

    const library = await service.getLibrary(ORG);

    expect(library).toHaveLength(RISK_LIBRARY.length);
    expect(library.find((t) => t.id === first.id)?.added).toBe(true);
    expect(library.filter((t) => t.added)).toHaveLength(1);
  });

  it('has unique template ids', () => {
    const ids = RISK_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bulk-creates new risks, skipping existing and repeated titles', async () => {
    mockDb.risk.findMany.mockResolvedValue([{ title: 'Existing risk' }]);
    mockDb.risk.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `rsk_${data.title}`, title: data.title, ref: 'R-001' }),
    );
    const draft = {
      description: 'd',
      category: 'technology' as const,
      likelihood: 'possible' as const,
      impact: 'major' as const,
    };

    const result = await service.bulkCreate({
      organizationId: ORG,
      risks: [
        { ...draft, title: 'existing RISK' },
        { ...draft, title: 'New risk', treatmentStrategyDescription: 'Plan' },
        { ...draft, title: 'new risk' },
      ],
    });

    expect(result.created).toEqual([
      { id: 'rsk_New risk', title: 'New risk', ref: 'R-001', linkedTasks: 0 },
    ]);
    expect(result.skipped).toEqual(['existing RISK', 'new risk']);
    expect(mockDb.risk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          residualLikelihood: 'possible',
          residualImpact: 'major',
          treatmentStrategy: 'mitigate',
          treatmentStrategyDescription: 'Plan',
        }),
      }),
    );
  });

  it('links library references to org controls’ tasks, sets the owner and a treatment action', async () => {
    mockDb.risk.findMany.mockResolvedValue([]);
    mockDb.requirementMap.findMany.mockResolvedValue([
      {
        controlId: 'ctl_1',
        requirement: { identifier: '6.4.3', framework: { name: 'PCI DSS Level 1' } },
        control: { tasks: [{ id: 'tsk_1' }, { id: 'tsk_2' }] },
      },
      {
        controlId: 'ctl_2',
        requirement: { identifier: 'A.8.28', framework: { name: 'ISO 27001' } },
        control: { tasks: [{ id: 'tsk_2' }] },
      },
    ]);
    mockDb.risk.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'rsk_1', title: data.title, ref: 'R-007' }),
    );

    const result = await service.bulkCreate({
      organizationId: ORG,
      ownerMemberId: 'mem_1',
      risks: [
        {
          title: 'Skimming',
          description: 'd',
          category: 'technology',
          likelihood: 'possible',
          impact: 'severe',
          treatmentStrategyDescription: 'Inventory scripts',
          references: ['PCI DSS 6.4.3', 'ISO A.8.28', 'Not a ref'],
        },
      ],
    });

    expect(mockDb.requirementMap.findMany.mock.calls[0][0].where).toMatchObject({
      archivedAt: null,
      frameworkInstance: { organizationId: ORG },
    });
    const { data } = mockDb.risk.create.mock.calls[0][0];
    expect(data).toMatchObject({
      assigneeId: 'mem_1',
      frameworkRefs: ['PCI DSS 6.4.3', 'ISO A.8.28', 'Not a ref'],
      tasks: { connect: [{ id: 'tsk_1' }, { id: 'tsk_2' }] },
    });
    const action = mockDb.taskItem.create.mock.calls[0][0].data;
    expect(action).toMatchObject({
      entityType: 'risk',
      entityId: 'rsk_1',
      organizationId: ORG,
      assigneeId: 'mem_1',
      createdById: 'mem_1',
      description: 'Inventory scripts',
    });
    const days = (action.dueDate.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
    expect(result.created[0]).toMatchObject({ ref: 'R-007', linkedTasks: 2 });
  });

  it('counts recommended controls per library template', async () => {
    mockDb.risk.findMany.mockResolvedValue([]);
    mockDb.requirementMap.findMany.mockResolvedValue([
      {
        controlId: 'ctl_1',
        requirement: { identifier: '6.4.3', framework: { name: 'PCI DSS Level 1' } },
        control: { tasks: [] },
      },
    ]);
    const library = await service.getLibrary(ORG);
    const skimming = library.find((t) => t.references.includes('PCI DSS 6.4.3'));
    expect(skimming?.recommendedControls).toBe(1);
  });

  it('lists actions only for visible risks and flags overdue ones', async () => {
    mockDb.risk.findMany.mockResolvedValue([{ id: 'rsk_1', title: 'R1', status: 'open' }]);
    mockDb.taskItem.findMany.mockResolvedValue([
      { id: 'tski_1', entityId: 'rsk_1', status: 'todo', dueDate: new Date('2020-01-01') },
      { id: 'tski_2', entityId: 'rsk_1', status: 'done', dueDate: new Date('2020-01-01') },
    ]);

    const rows = await service.listActions({
      organizationId: ORG,
      query: { overdue: true, assigneeId: 'mem_1' },
      assignmentFilter: { assigneeId: 'mem_1' },
    });

    expect(mockDb.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, assigneeId: 'mem_1' } }),
    );
    const where = mockDb.taskItem.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG,
      entityType: 'risk',
      entityId: { in: ['rsk_1'] },
      assigneeId: 'mem_1',
    });
    expect(where.AND).toHaveLength(2);
    expect(rows.map((r) => [r.id, r.isOverdue, r.risk?.title])).toEqual([
      ['tski_1', true, 'R1'],
      ['tski_2', false, 'R1'],
    ]);
  });
});

describe('isActionOverdue', () => {
  const now = new Date('2026-06-01');
  it.each([
    ['todo', null, false],
    ['todo', new Date('2026-05-31'), true],
    ['in_progress', new Date('2026-06-02'), false],
    ['canceled', new Date('2026-01-01'), false],
  ])('%s due %s -> %s', (status, dueDate, expected) => {
    expect(isActionOverdue({ status, dueDate, now })).toBe(expected);
  });
});
