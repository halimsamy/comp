import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import type { RiskReviewsResponse } from '@/hooks/use-risk-workspace';
import { RiskReviews } from './RiskReviews';

let mockState: Partial<RiskReviewsResponse> & { error: Error | null } = { error: null };
const mockMutate = vi.fn();

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-risk-workspace', () => ({
  useRiskReviews: () => ({
    reviews: mockState.data ?? [],
    settings: mockState.settings ?? null,
    status: mockState.status ?? null,
    error: mockState.error,
    isLoading: false,
    mutate: mockMutate,
  }),
  useRiskWorkspaceMutations: () => ({ recordReview: vi.fn() }),
}));
vi.mock('./RecordRiskReviewSheet', () => ({
  RecordRiskReviewSheet: ({ open }: { open: boolean }) => (open ? <div>record sheet</div> : null),
  TRIGGER_LABEL: { scheduled: 'Scheduled review', significant_change: 'Significant change' },
}));
vi.mock('./RiskReviewDetailDialog', () => ({ RiskReviewDetailDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const settings = { acceptanceRequiredFromLevel: 'medium', reviewIntervalMonths: 3 } as const;
const totals = {
  risks: 12,
  byInherentLevel: { 'very-low': 0, low: 2, medium: 4, high: 4, 'very-high': 2 },
  byResidualLevel: { 'very-low': 2, low: 5, medium: 3, high: 1, 'very-high': 1 },
  withoutOwner: 0,
  awaitingAcceptance: 1,
  staleAcceptance: 0,
  openActions: 3,
  overdueActions: 1,
};

const renderReviews = () => render(<RiskReviews orgId="org_1" members={[]} />);

describe('RiskReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { error: null };
  });

  it('asks for a first review when none was recorded', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockState = {
      error: null,
      data: [],
      settings,
      status: { lastReviewedAt: null, nextReviewDue: null, isOverdue: true },
    };
    renderReviews();
    expect(screen.getByText('Never reviewed')).toBeInTheDocument();
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Risk Assessment Methodology/ })).toHaveAttribute(
      'href',
      '/org_1/documents/isms/risk-methodology',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record review' }));
    expect(screen.getByText('record sheet')).toBeInTheDocument();
  });

  it('shows the history with frozen totals', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockState = {
      error: null,
      settings,
      status: { lastReviewedAt: '2026-11-01T00:00:00.000Z', nextReviewDue: '2099-02-01T00:00:00.000Z', isOverdue: false },
      data: [
        {
          id: 'rskrv_1',
          reviewedByName: 'Jane Doe',
          trigger: 'significant_change',
          notes: null,
          nextReviewDue: '2099-02-01T00:00:00.000Z',
          createdAt: '2026-11-01T00:00:00.000Z',
          totals,
        },
      ],
    };
    renderReviews();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Significant change')).toBeInTheDocument();
    expect(screen.getByText('2 residual')).toBeInTheDocument();
    // 1 awaiting acceptance + 1 overdue action
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides sign-off without risk:update', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    mockState = { error: null, data: [], settings, status: { lastReviewedAt: null, nextReviewDue: null, isOverdue: true } };
    renderReviews();
    expect(screen.queryByRole('button', { name: 'Record review' })).not.toBeInTheDocument();
  });

  it('explains a load failure', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockState = { error: new Error('403') };
    renderReviews();
    expect(screen.getByText(/need access to\s+every risk/)).toBeInTheDocument();
  });
});
