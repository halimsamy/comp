const mockDb = {
  riskReview: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  member: { findFirst: jest.fn() },
  risk: { findMany: jest.fn() },
  riskAcceptance: { findMany: jest.fn() },
  taskItem: { findMany: jest.fn() },
  ismsDocument: { findFirst: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb, Prisma: {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RiskReviewsService } from './risk-reviews.service';

const ORG = 'org_1';

describe('RiskReviewsService', () => {
  const service = new RiskReviewsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.ismsDocument.findFirst.mockResolvedValue({
      draftNarrative: { reviewIntervalMonths: 6, acceptanceRequiredFromLevel: 'high' },
    });
    mockDb.risk.findMany.mockResolvedValue([
      {
        id: 'rsk_1',
        title: 'R1',
        category: 'technology',
        status: 'open',
        likelihood: 'likely',
        impact: 'severe',
        residualLikelihood: 'possible',
        residualImpact: 'major',
        treatmentStrategy: 'mitigate',
        assignee: { user: { name: 'Jane', email: 'j@x.com' } },
      },
    ]);
    mockDb.riskAcceptance.findMany.mockResolvedValue([]);
    mockDb.taskItem.findMany.mockResolvedValue([
      { entityId: 'rsk_1', status: 'todo', dueDate: new Date('2020-01-01') },
    ]);
    mockDb.riskReview.create.mockImplementation(({ data }) => Promise.resolve({ id: 'rskrv_1', ...data }));
  });

  it('records a review signed by the caller with a frozen snapshot and next due date', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1', user: { name: ' Jane ', email: 'j@x.com' } });
    const before = Date.now();

    const review = await service.create({
      organizationId: ORG,
      callerMemberId: 'mem_1',
      dto: { notes: '  Looked at everything  ' },
    });

    expect(mockDb.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mem_1', organizationId: ORG, deactivated: false } }),
    );
    expect(review).toMatchObject({
      reviewedById: 'mem_1',
      reviewedByName: 'Jane',
      notes: 'Looked at everything',
      trigger: 'scheduled',
    });
    // medium residual is below the configured "high" threshold.
    const { snapshot } = mockDb.riskReview.create.mock.calls[0][0].data;
    expect(snapshot.risks[0]).toMatchObject({ acceptance: 'not_required', openActions: 1, overdueActions: 1 });
    expect(snapshot.acceptanceRequiredFromLevel).toBe('high');
    const months =
      (review.nextReviewDue.getFullYear() - new Date(before).getFullYear()) * 12 +
      review.nextReviewDue.getMonth() - new Date(before).getMonth();
    expect(months).toBe(6);
  });

  it('uses an explicit reviewer over the caller', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_2', user: { name: null, email: 'ceo@x.com' } });
    const review = await service.create({
      organizationId: ORG,
      callerMemberId: 'mem_1',
      dto: { reviewedById: 'mem_2', trigger: 'significant_change' },
    });
    expect(review).toMatchObject({
      reviewedById: 'mem_2',
      reviewedByName: 'ceo@x.com',
      notes: null,
      trigger: 'significant_change',
    });
  });

  it('needs a reviewer for API-key callers', async () => {
    await expect(service.create({ organizationId: ORG, callerMemberId: null, dto: {} })).rejects.toThrow(BadRequestException);
    expect(mockDb.riskReview.create).not.toHaveBeenCalled();
  });

  it('rejects a reviewer outside the organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ organizationId: ORG, callerMemberId: 'mem_1', dto: { reviewedById: 'mem_other' } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports a review as due when none was ever recorded', async () => {
    mockDb.riskReview.findMany.mockResolvedValue([]);
    const result = await service.list(ORG);
    expect(result.status).toEqual({ lastReviewedAt: null, nextReviewDue: null, isOverdue: true });
    expect(result.settings).toEqual({ acceptanceRequiredFromLevel: 'high', reviewIntervalMonths: 6 });
  });

  it('lists reviews with totals and the next due date from the latest', async () => {
    const next = new Date(Date.now() + 86_400_000);
    mockDb.riskReview.findMany.mockResolvedValue([
      { id: 'rskrv_2', reviewedByName: 'Jane', notes: null, nextReviewDue: next, createdAt: new Date(), snapshot: { totals: { risks: 3 } } },
      { id: 'rskrv_1', reviewedByName: 'Jane', notes: null, nextReviewDue: new Date(0), createdAt: new Date(0), snapshot: 'bad' },
    ]);
    const result = await service.list(ORG);
    expect(result.status).toMatchObject({ nextReviewDue: next, isOverdue: false });
    expect(result.data.map((r) => r.totals)).toEqual([{ risks: 3 }, null]);
    expect(mockDb.riskReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG } }));
  });

  it('scopes get by organization', async () => {
    mockDb.riskReview.findFirst.mockResolvedValue(null);
    await expect(service.get({ id: 'rskrv_x', organizationId: ORG })).rejects.toThrow(NotFoundException);
    expect(mockDb.riskReview.findFirst).toHaveBeenCalledWith({ where: { id: 'rskrv_x', organizationId: ORG } });
  });
});
