import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessReviewDetail } from './AccessReviewDetail';

const { hasPermission, useAccessReview, decide } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  useAccessReview: vi.fn(),
  decide: vi.fn(),
}));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-access-reviews', () => ({
  useAccessReview,
  useAccessMutations: () => ({ decide, remediate: vi.fn(), signOff: vi.fn(), downloadReport: vi.fn(), deleteReview: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const item = {
  id: 'ari_1',
  reviewSystemId: 'ars_1',
  accountId: 'bob@acme.com',
  accountName: 'Bob',
  email: 'bob@acme.com',
  ownerName: 'Bob',
  accountType: 'human',
  accountStatus: 'active',
  roles: ['Super Admin'],
  isAdmin: true,
  mfaEnabled: true,
  lastLoginAt: null,
  flags: ['owner_departed', 'admin'],
  decision: null,
  comment: null,
  decidedByName: null,
  decidedAt: null,
  remediatedAt: null,
  remediationNote: null,
};

function mockReview(overrides: Record<string, unknown> = {}) {
  useAccessReview.mockReturnValue({
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    review: {
      id: 'arv_1',
      name: 'H2 review',
      status: 'in_progress',
      dueDate: '2099-01-01',
      createdAt: '2026-11-01',
      createdByName: 'Admin',
      signedOffByName: null,
      signedOffAt: null,
      signOffNote: null,
      taskId: null,
      systems: [{ id: 'ars_1', systemKey: 'compai', systemName: 'Google Workspace', reviewerName: null }],
      items: [item],
      progress: { total: 1, decided: 0, kept: 0, revoked: 0, modified: 0, flagged: 1, pendingRemediation: 0 },
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  decide.mockResolvedValue({ updated: 1, skipped: 0 });
  mockReview();
});

describe('AccessReviewDetail', () => {
  it('shows pre-flags and asks for a justification to keep a flagged account (#79)', async () => {
    hasPermission.mockReturnValue(true);
    render(<AccessReviewDetail orgId="org_1" reviewId="arv_1" />);
    expect(screen.getAllByText('Owner left').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Sign off/ })).toBeDisabled();

    const group = screen.getByRole('group', { name: 'Decision for Bob' });
    fireEvent.click(group.querySelector('button') as HTMLButtonElement);
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText('Justification'), { target: { value: 'Break-glass admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({
        reviewId: 'arv_1',
        itemIds: ['ari_1'],
        decision: 'keep',
        comment: 'Break-glass admin',
      }),
    );
  });

  it('keeps an unflagged account straight away', async () => {
    hasPermission.mockReturnValue(true);
    mockReview({ items: [{ ...item, flags: [] }] });
    render(<AccessReviewDetail orgId="org_1" reviewId="arv_1" />);
    const group = screen.getByRole('group', { name: 'Decision for Bob' });
    fireEvent.click(group.querySelector('button') as HTMLButtonElement);
    await waitFor(() =>
      expect(decide).toHaveBeenCalledWith({ reviewId: 'arv_1', itemIds: ['ari_1'], decision: 'keep', comment: undefined }),
    );
  });

  it('labels bulk actions with the undecided count and the rows it skips', () => {
    hasPermission.mockReturnValue(true);
    mockReview({
      items: [
        { ...item, flags: [] },
        { ...item, id: 'ari_2', accountName: 'Ann', flags: [], decision: 'revoke' },
      ],
    });
    render(<AccessReviewDetail orgId="org_1" reviewId="arv_1" />);
    fireEvent.click(screen.getByLabelText('Select all accounts'));
    expect(screen.getByRole('button', { name: 'Keep 1 undecided (1 skipped)' })).toBeInTheDocument();
  });

  it('enables sign-off once every account is decided', () => {
    hasPermission.mockReturnValue(true);
    mockReview({
      items: [{ ...item, decision: 'keep' }],
      progress: { total: 1, decided: 1, kept: 1, revoked: 0, modified: 0, flagged: 1, pendingRemediation: 0 },
    });
    render(<AccessReviewDetail orgId="org_1" reviewId="arv_1" />);
    expect(screen.getByRole('button', { name: /Sign off/ })).toBeEnabled();
  });

  it('is read-only without member:update', () => {
    hasPermission.mockReturnValue(false);
    render(<AccessReviewDetail orgId="org_1" reviewId="arv_1" />);
    expect(screen.queryByRole('group', { name: 'Decision for Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign off/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Report/ })).toBeInTheDocument();
  });
});
