import { db } from '@db';
import { recordComputedMetrics } from '../../isms/documents/metric-automation';
import { recordIsmsMetricsForAllOrgs } from './record-isms-metrics-schedule';

jest.mock('@db', () => ({ db: { ismsDocument: { findMany: jest.fn() } } }));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  schedules: { task: (definition: unknown) => definition },
}));
jest.mock('../../isms/documents/metric-automation', () => ({
  recordComputedMetrics: jest.fn(),
}));

describe('recordIsmsMetricsForAllOrgs', () => {
  it('records the period that just ended for every monitoring document', async () => {
    (db.ismsDocument.findMany as jest.Mock).mockResolvedValue([
      { id: 'doc_a', organizationId: 'org_a' },
      { id: 'doc_b', organizationId: 'org_b' },
    ]);
    (recordComputedMetrics as jest.Mock)
      .mockResolvedValueOnce({ count: 3 })
      .mockRejectedValueOnce(new Error('boom'));
    const now = new Date('2026-12-01T03:00:00.000Z');

    const result = await recordIsmsMetricsForAllOrgs(now);

    expect(recordComputedMetrics).toHaveBeenCalledWith({
      documentId: 'doc_a',
      organizationId: 'org_a',
      now,
      period: 'previous',
    });
    // One org failing does not stop the run.
    expect(result).toEqual({ documents: 2, recorded: 3 });
  });
});
