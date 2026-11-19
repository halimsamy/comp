import { db } from '@db';
import { previewComputedMetrics, recordComputedMetrics } from './metric-automation';
import { computePlatformMetrics } from './metric-compute-data';

jest.mock('@db', () => {
  const db = {
    ismsMetric: { findMany: jest.fn() },
    ismsMeasurement: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
  };
  return { db };
});
jest.mock('./metric-compute-data', () => ({
  computePlatformMetrics: jest.fn(),
  isComputedMetricKey: (key: string | null) =>
    ['training_completion', 'task_on_time'].includes(key ?? ''),
}));

const mockDb = jest.mocked(db);
const now = new Date('2026-11-18T10:00:00.000Z');

describe('computed metric automation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (computePlatformMetrics as jest.Mock).mockResolvedValue({
      training_completion: { value: '80%', note: '8 of 10' },
      task_on_time: { value: 'n/a', note: 'no tasks' },
    });
    (mockDb.ismsMetric.findMany as jest.Mock).mockResolvedValue([
      { id: 'm1', metricKey: 'training_completion', name: 'Training', cadence: 'monthly', measurements: [] },
      { id: 'm2', metricKey: 'uptime', name: 'Uptime', cadence: 'monthly', measurements: [] },
      { id: 'm3', metricKey: 'task_on_time', name: 'Tasks', cadence: 'quarterly', measurements: [] },
    ]);
    (mockDb.ismsMeasurement.findMany as jest.Mock).mockResolvedValue([]);
    (mockDb.ismsMeasurement.createMany as jest.Mock).mockImplementation(
      ({ data }: { data: unknown[] }) => ({ count: data.length }),
    );
  });

  it('previews only computable metrics, for the right period', async () => {
    const rows = await previewComputedMetrics({
      documentId: 'doc_1',
      organizationId: 'org_1',
      now,
      period: 'current',
    });
    expect(rows.map((row) => row.metricKey)).toEqual(['training_completion', 'task_on_time']);
    expect(rows[0]).toMatchObject({ periodStart: '2026-11-01', value: '80%', recordedForPeriod: false });
    expect(rows[1].periodStart).toBe('2026-10-01');
    // Scoped to the org's monitoring document.
    expect(mockDb.ismsMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          document: { organizationId: 'org_1', type: 'monitoring' },
        }),
      }),
    );
  });

  it('records the previous period, skipping n/a values', async () => {
    const result = await recordComputedMetrics({
      documentId: 'doc_1',
      organizationId: 'org_1',
      now,
      period: 'previous',
    });
    expect(result).toEqual({ count: 1 });
    const { data } = (mockDb.ismsMeasurement.createMany as jest.Mock).mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({
        metricId: 'm1',
        periodStart: new Date('2026-10-01T00:00:00.000Z'),
        value: '80%',
        source: 'computed',
      }),
    ]);
  });

  it('never adds a second value to a period that already has one', async () => {
    (mockDb.ismsMetric.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        metricKey: 'training_completion',
        name: 'Training',
        cadence: 'monthly',
        measurements: [{ periodStart: new Date('2026-11-01T00:00:00.000Z') }],
      },
    ]);
    const result = await recordComputedMetrics({
      documentId: 'doc_1',
      organizationId: 'org_1',
      now,
      period: 'current',
    });
    expect(result).toEqual({ count: 0 });
    expect(mockDb.ismsMeasurement.createMany).not.toHaveBeenCalled();
  });

  it('re-checks under the lock to avoid racing another run', async () => {
    (mockDb.ismsMeasurement.findMany as jest.Mock).mockResolvedValue([
      { metricId: 'm1', periodStart: new Date('2026-10-01T00:00:00.000Z') },
    ]);
    const result = await recordComputedMetrics({ documentId: 'doc_1', organizationId: 'org_1', now });
    expect(result).toEqual({ count: 0 });
  });

  it('defaults to the last closed period (#39)', async () => {
    await recordComputedMetrics({ documentId: 'doc_1', organizationId: 'org_1', now });
    const { data } = (mockDb.ismsMeasurement.createMany as jest.Mock).mock.calls[0][0];
    expect(data[0]).toMatchObject({
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      provisional: false,
    });
  });

  it('a snapshot of the running period is provisional', async () => {
    await recordComputedMetrics({
      documentId: 'doc_1',
      organizationId: 'org_1',
      now,
      period: 'current',
    });
    const { data } = (mockDb.ismsMeasurement.createMany as jest.Mock).mock.calls[0][0];
    expect(data[0]).toMatchObject({
      periodStart: new Date('2026-11-01T00:00:00.000Z'),
      provisional: true,
    });
  });

  it('the final value replaces a provisional snapshot', async () => {
    (mockDb.ismsMetric.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        metricKey: 'training_completion',
        name: 'Training',
        cadence: 'monthly',
        measurements: [{ periodStart: new Date('2026-10-01T00:00:00.000Z'), provisional: true }],
      },
    ]);
    const result = await recordComputedMetrics({ documentId: 'doc_1', organizationId: 'org_1', now });
    expect(result).toEqual({ count: 1 });
    expect(mockDb.ismsMeasurement.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ metricId: 'm1', periodStart: new Date('2026-10-01T00:00:00.000Z') }],
        provisional: true,
        source: 'computed',
      },
    });
  });
});
