import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputedMetricsCard, type ComputedMetricPreview } from './ComputedMetricsCard';

const state: { data: ComputedMetricPreview[] | undefined } = { data: undefined };
const mockMutate = vi.fn();
vi.mock('swr', () => ({
  default: () => ({ data: state.data, error: undefined, mutate: mockMutate }),
}));

const mockPost = vi.fn();
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: (...args: unknown[]) => mockPost(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const preview = (overrides: Partial<ComputedMetricPreview>): ComputedMetricPreview => ({
  metricId: 'm1',
  metricKey: 'training_completion',
  name: 'Security awareness training completion',
  cadence: 'monthly',
  periodStart: '2026-11-01',
  value: '80%',
  note: '8 of 10 in-scope members completed all required security training.',
  recordedForPeriod: false,
  ...overrides,
});

describe('ComputedMetricsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = [
      preview({}),
      preview({ metricId: 'm2', name: 'Policy acknowledgement', recordedForPeriod: true }),
    ];
  });

  it('shows each computed value and whether its period is recorded', () => {
    render(
      <ComputedMetricsCard
        organizationId="org_1"
        documentId="doc_1"
        canRecord
        onRecorded={vi.fn()}
      />,
    );
    expect(screen.getByText('Security awareness training completion')).toBeInTheDocument();
    expect(screen.getByText('Due for 2026-11-01')).toBeInTheDocument();
    expect(screen.getByText('Recorded for 2026-11-01')).toBeInTheDocument();
  });

  it('records the pending metrics for the last closed period (#39)', async () => {
    mockPost.mockResolvedValue({ data: { count: 1 }, error: null });
    const onRecorded = vi.fn().mockResolvedValue(undefined);
    render(
      <ComputedMetricsCard
        organizationId="org_1"
        documentId="doc_1"
        canRecord
        onRecorded={onRecorded}
      />,
    );
    fireEvent.click(screen.getByText('Record 1 for the last closed period'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/isms/documents/doc_1/metrics/computed/record',
        { period: 'previous' },
        'org_1',
      ),
    );
    expect(onRecorded).toHaveBeenCalled();
  });

  it('takes a provisional snapshot of the open period', async () => {
    mockPost.mockResolvedValue({ data: { count: 2 }, error: null });
    render(
      <ComputedMetricsCard organizationId="org_1" documentId="doc_1" canRecord onRecorded={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Snapshot now (provisional)'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/isms/documents/doc_1/metrics/computed/record',
        { period: 'current' },
        'org_1',
      ),
    );
  });

  it('hides recording for a read-only user', () => {
    render(
      <ComputedMetricsCard
        organizationId="org_1"
        documentId="doc_1"
        canRecord={false}
        onRecorded={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Record \d+ for the last closed period/)).not.toBeInTheDocument();
    expect(screen.queryByText('Snapshot now (provisional)')).not.toBeInTheDocument();
  });

  it('renders nothing when no metric is computable', () => {
    state.data = [];
    const { container } = render(
      <ComputedMetricsCard
        organizationId="org_1"
        documentId="doc_1"
        canRecord
        onRecorded={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
