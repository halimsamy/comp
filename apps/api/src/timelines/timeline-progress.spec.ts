const mockDb = {
  frameworkInstance: { findMany: jest.fn() },
  auditEngagement: { findMany: jest.fn() },
  timelineInstance: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../frameworks/frameworks-scores.helper', () => ({
  getOverviewScores: jest.fn().mockResolvedValue({
    people: { total: 4, completed: 1 },
    policies: { total: 100, published: 100 },
    tasks: { total: 100, done: 100 },
  }),
}));
jest.mock('../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn().mockResolvedValue([{ id: 'req_1' }]),
}));
jest.mock('../frameworks/scoring/requirement-scoring', () => ({
  loadInstanceScoring: jest.fn(async ({ frameworkInstanceId }: { frameworkInstanceId: string }) => ({
    scores: {
      counts:
        frameworkInstanceId === 'fi_iso'
          ? { policies: { total: 10, completed: 5 }, tasks: { total: 4, completed: 1 } }
          : { policies: { total: 0, completed: 0 }, tasks: { total: 3, completed: 3 } },
    },
  })),
}));

import { listOverduePhases, loadAuditWindows, loadTimelinePercentages } from './timeline-progress';

beforeEach(() => jest.clearAllMocks());

describe('loadTimelinePercentages', () => {
  it('uses each framework’s own policy and task scores, and org-wide people', async () => {
    mockDb.frameworkInstance.findMany.mockResolvedValue([
      { id: 'fi_iso', frameworkId: 'f1', customFrameworkId: null, currentVersionId: null },
      { id: 'fi_pci', frameworkId: 'f2', customFrameworkId: null, currentVersionId: null },
    ]);
    const result = await loadTimelinePercentages({
      organizationId: 'org_1',
      frameworkInstanceIds: ['fi_iso', 'fi_pci', 'fi_iso'],
    });
    expect(mockDb.frameworkInstance.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['fi_iso', 'fi_pci'] },
      organizationId: 'org_1',
    });
    expect(result.get('fi_iso')).toEqual({ AUTO_POLICIES: 50, AUTO_TASKS: 25, AUTO_PEOPLE: 25 });
    expect(result.get('fi_pci')).toEqual({ AUTO_POLICIES: 0, AUTO_TASKS: 100, AUTO_PEOPLE: 25 });
  });
});

describe('loadAuditWindows', () => {
  it('keeps the latest open audit per framework', async () => {
    mockDb.auditEngagement.findMany.mockResolvedValue([
      { frameworkInstanceId: 'fi_pci', periodStart: new Date('2027-01-01'), periodEnd: new Date('2027-02-01') },
      { frameworkInstanceId: 'fi_pci', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-02-01') },
    ]);
    const result = await loadAuditWindows('org_1');
    expect(mockDb.auditEngagement.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      status: { not: 'completed' },
    });
    expect(result.get('fi_pci')?.periodStart).toEqual(new Date('2027-01-01'));
  });
});

describe('listOverduePhases', () => {
  it('returns active phases past their end date', async () => {
    mockDb.timelineInstance.findMany.mockResolvedValue([
      {
        id: 'tli_1',
        frameworkInstanceId: 'fi_iso',
        frameworkInstance: { framework: { name: 'ISO 27001' }, customFramework: null },
        phases: [
          {
            id: 'p1',
            name: 'Evidence Gathering',
            orderIndex: 0,
            status: 'IN_PROGRESS',
            completionType: 'AUTO_TASKS',
            durationWeeks: 8,
            datesPinned: false,
            startDate: new Date('2026-05-12'),
            endDate: new Date('2026-07-07'),
          },
        ],
      },
    ]);
    const result = await listOverduePhases('org_1', new Date('2026-11-18'));
    expect(result).toEqual([
      expect.objectContaining({ phaseId: 'p1', frameworkName: 'ISO 27001', dueDate: new Date('2026-07-07') }),
    ]);
  });
});
