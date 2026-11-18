const mockDb = {
  employeeTrainingVideoCompletion: { findMany: jest.fn(), update: jest.fn() },
  trainingCompletionRecord: { findFirst: jest.fn(), create: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn() },
  schedules: { task: (config: unknown) => config },
}));
jest.mock('@trycompai/company', () => ({ GENERAL_TRAINING_VIDEO_IDS: [], HIPAA_TRAINING_ID: 'h' }));

import { expireTrainingCompletions } from './expire-training-completions';

describe('expireTrainingCompletions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('archives missing history and clears completions older than 12 months', async () => {
    const completedAt = new Date('2025-01-01');
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { id: 'evc_1', memberId: 'mem_1', videoId: 'sat-1', completedAt, member: { organizationId: 'org_1' } },
      { id: 'evc_2', memberId: 'mem_2', videoId: 'sat-1', completedAt, member: { organizationId: 'org_1' } },
    ]);
    mockDb.trainingCompletionRecord.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tcr_existing' });

    const result = await expireTrainingCompletions(new Date('2026-11-18'));

    const where = mockDb.employeeTrainingVideoCompletion.findMany.mock.calls[0][0].where;
    expect(where.completedAt.lte.toISOString().slice(0, 10)).toBe('2025-11-18');
    expect(mockDb.trainingCompletionRecord.create).toHaveBeenCalledTimes(1);
    expect(mockDb.employeeTrainingVideoCompletion.update).toHaveBeenCalledTimes(2);
    expect(mockDb.employeeTrainingVideoCompletion.update).toHaveBeenCalledWith({
      where: { id: 'evc_1' },
      data: { completedAt: null },
    });
    expect(result).toEqual({ expired: 2, archived: 1 });
  });
});
