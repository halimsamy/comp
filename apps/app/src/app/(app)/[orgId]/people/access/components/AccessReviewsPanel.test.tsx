import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessReviewsPanel, reviewStatus } from './AccessReviewsPanel';

const { hasPermission, useAccessReviews } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  useAccessReviews: vi.fn(),
}));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-access-reviews', () => ({
  useAccessReviews,
  useAccessSystems: () => ({ systems: [{ key: 'compai', name: 'Comp AI', accountCount: 3 }] }),
  useAccessMutations: () => ({ createReview: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const review = {
  id: 'arv_1',
  name: 'H2 2026 user access review',
  status: 'in_progress' as const,
  dueDate: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  createdByName: 'Admin',
  signedOffByName: null,
  signedOffAt: null,
  taskId: null,
  systems: [{ systemName: 'Google Workspace', reviewerName: 'CISO' }],
  progress: { total: 10, decided: 4, kept: 4, revoked: 0, modified: 0, flagged: 2, pendingRemediation: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  useAccessReviews.mockReturnValue({ reviews: [review], isLoading: false, error: undefined, mutate: vi.fn() });
});

describe('AccessReviewsPanel', () => {
  it('lists reviews with progress and lets admins start one', () => {
    hasPermission.mockReturnValue(true);
    render(<AccessReviewsPanel orgId="org_1" members={[]} />);
    expect(screen.getByRole('link', { name: review.name })).toHaveAttribute(
      'href',
      '/org_1/people/access/reviews/arv_1',
    );
    expect(screen.getByText('4 of 10 reviewed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start review/ })).toBeInTheDocument();
  });

  it('hides Start review without member:update', () => {
    hasPermission.mockReturnValue(false);
    render(<AccessReviewsPanel orgId="org_1" members={[]} />);
    expect(screen.queryByRole('button', { name: /Start review/ })).not.toBeInTheDocument();
  });

  it('shows guidance when there are no reviews', () => {
    hasPermission.mockReturnValue(true);
    useAccessReviews.mockReturnValue({ reviews: [], isLoading: false, error: undefined, mutate: vi.fn() });
    render(<AccessReviewsPanel orgId="org_1" members={[]} />);
    expect(screen.getByText('No access reviews yet')).toBeInTheDocument();
  });

  it('marks open reviews past their due date as overdue', () => {
    expect(reviewStatus({ status: 'in_progress', dueDate: '2020-01-01' }).label).toBe('Overdue');
    expect(reviewStatus({ status: 'completed', dueDate: '2020-01-01' }).label).toBe('Completed');
  });
});
