import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockDownload = vi.fn();
vi.mock('@/lib/evidence-download', () => ({
  downloadRiskReviewCsv: (...args: unknown[]) => mockDownload(...args),
}));
const mockToast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@/hooks/use-risk-workspace', () => ({
  useRiskReview: () => ({
    review: {
      id: 'rskrv_1',
      createdAt: '2026-03-01T00:00:00.000Z',
      reviewedByName: 'Ada',
      trigger: 'scheduled',
      notes: null,
      nextReviewDue: '2027-03-01T00:00:00.000Z',
      snapshot: { acceptanceRequiredFromLevel: 'high', risks: [] },
    },
    error: undefined,
    isLoading: false,
  }),
}));
const pass = vi.hoisted(() => ({ children }: { children?: unknown }) => children);
vi.mock('@trycompai/design-system', () => ({
  Badge: pass,
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Dialog: pass,
  DialogContent: pass,
  DialogDescription: pass,
  DialogHeader: pass,
  DialogTitle: pass,
  Spinner: () => null,
  Table: pass,
  TableBody: pass,
  TableCell: pass,
  TableHead: pass,
  TableHeader: pass,
  TableRow: pass,
  Text: pass,
}));
vi.mock('@trycompai/design-system/icons', () => ({ Download: () => null }));
vi.mock('./RecordRiskReviewSheet', () => ({ TRIGGER_LABEL: { scheduled: 'Scheduled' } }));

import { RiskReviewDetailDialog } from './RiskReviewDetailDialog';

describe('RiskReviewDetailDialog', () => {
  it('downloads the frozen register of this review as CSV', async () => {
    mockDownload.mockResolvedValue(undefined);
    render(<RiskReviewDetailDialog reviewId="rskrv_1" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('rskrv_1'));
  });

  it('tells the user when the download fails', async () => {
    mockDownload.mockRejectedValue(new Error('403'));
    render(<RiskReviewDetailDialog reviewId="rskrv_1" onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});
