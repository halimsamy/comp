const mockDb = {
  risk: { findMany: jest.fn(), create: jest.fn() },
  taskItem: { findMany: jest.fn() },
  $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb, Prisma: {} }));

import { RISK_LIBRARY } from './risk-library';
import { isActionOverdue, RiskWorkspaceService } from './risk-workspace.service';

const ORG = 'org_1';

describe('RiskWorkspaceService', () => {
  const service = new RiskWorkspaceService();
  beforeEach(() => jest.clearAllMocks());

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
      Promise.resolve({ id: `rsk_${data.title}`, title: data.title }),
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

    expect(result.created).toEqual([{ id: 'rsk_New risk', title: 'New risk' }]);
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
