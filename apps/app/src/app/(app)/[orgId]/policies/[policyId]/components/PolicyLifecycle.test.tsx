import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { PolicyLifecycle, type PolicyLifecyclePolicy } from './PolicyLifecycle';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const mockRecordReview = vi.fn();
const mockMutateAcknowledgements = vi.fn();
const review = (reviewedAt: string) => ({
  id: 'prv_1',
  reviewedAt,
  nextReviewDate: '2027-06-01T00:00:00Z',
  notes: 'No changes needed',
  reviewer: { id: 'mem_1', user: { id: 'u1', name: 'Rita Reviewer', email: 'r@x.io' } },
  policyVersion: { id: 'pv_2', version: 2 },
});
const reviewState = { reviews: [review('2026-06-01T00:00:00Z')] };
vi.mock('@/hooks/use-policy-lifecycle', () => ({
  usePolicyReviews: () => ({
    reviews: reviewState.reviews,
    recordReview: mockRecordReview,
  }),
  usePolicyAcknowledgements: () => ({
    acknowledgements: { summary: { total: 4, acknowledged: 3, pending: 1 } },
    mutate: mockMutateAcknowledgements,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const future = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const basePolicy: PolicyLifecyclePolicy = {
  id: 'pol_1',
  status: 'published',
  frequency: 'yearly',
  reviewDate: future,
  lastPublishedAt: '2026-01-15T00:00:00Z',
  pendingVersionId: null,
  approverId: null,
  isArchived: false,
  assignee: { user: { name: 'Olivia Owner' } },
};
const version = {
  version: 2,
  approvedAt: '2026-01-14T00:00:00Z',
  approvedBy: { user: { name: 'Adam Approver' } },
  approvalComment: 'Reviewed with legal',
};

describe('PolicyLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockPermissions(ADMIN_PERMISSIONS);
    reviewState.reviews = [review('2026-06-01T00:00:00Z')];
  });

  it('marks the periodic review done once a review exists in this cycle', () => {
    render(<PolicyLifecycle policy={basePolicy} currentVersion={version} />);
    expect(screen.getByText('Last reviewed')).toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('labels the approval date "Approved" until the first review', () => {
    reviewState.reviews = [];
    render(<PolicyLifecycle policy={basePolicy} currentVersion={version} />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Last reviewed')).not.toBeInTheDocument();
  });

  it('shows the document-control facts and current step', () => {
    reviewState.reviews = [review('2025-06-01T00:00:00Z')];
    render(<PolicyLifecycle policy={basePolicy} currentVersion={version} />);
    expect(screen.getByText('Olivia Owner')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Adam Approver')).toBeInTheDocument();
    expect(screen.getByText(/Reviewed with legal/)).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 employees acknowledged/)).toBeInTheDocument();
    expect(screen.getByText('Approved & published').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByText(/Rita Reviewer reviewed v2/)).toBeInTheDocument();
  });

  it('flags an overdue review and lets an admin record it', async () => {
    mockRecordReview.mockResolvedValue({});
    const onMutate = vi.fn();
    render(
      <PolicyLifecycle
        policy={{ ...basePolicy, reviewDate: past }}
        currentVersion={version}
        onMutate={onMutate}
      />,
    );
    expect(screen.getByText(/due for its periodic review/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }));
    await userEvent.type(screen.getByLabelText(/review notes/i), 'Still accurate');
    await userEvent.click(screen.getByRole('button', { name: /record review/i }));

    expect(mockRecordReview).toHaveBeenCalledWith({
      notes: 'Still accurate',
      // UTC midnight of the picked day, so it never shifts a day in the PDF.
      nextReviewDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
      requireReacknowledgement: false,
    });
    expect(onMutate).toHaveBeenCalled();
    expect(mockMutateAcknowledgements).not.toHaveBeenCalled();
  });

  it('can ask employees to acknowledge again with the review', async () => {
    mockRecordReview.mockResolvedValue({});
    render(<PolicyLifecycle policy={basePolicy} currentVersion={version} />);

    await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /record review/i }));

    expect(mockRecordReview).toHaveBeenCalledWith(
      expect.objectContaining({ requireReacknowledgement: true }),
    );
    expect(mockMutateAcknowledgements).toHaveBeenCalled();
  });

  it('does not offer a review before the policy has a published version', () => {
    render(<PolicyLifecycle policy={{ ...basePolicy, status: 'needs_review' }} currentVersion={null} />);
    expect(screen.queryByRole('button', { name: /mark as reviewed/i })).not.toBeInTheDocument();
  });

  it('hides the review action from read-only users', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<PolicyLifecycle policy={{ ...basePolicy, reviewDate: past }} currentVersion={version} />);
    expect(screen.queryByRole('button', { name: /mark as reviewed/i })).not.toBeInTheDocument();
  });

  it('does not offer a review while changes are pending approval', () => {
    render(
      <PolicyLifecycle
        policy={{ ...basePolicy, pendingVersionId: 'pv_3', approverId: 'mem_2' }}
        currentVersion={version}
      />,
    );
    expect(screen.getByText('Pending approval').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('button', { name: /mark as reviewed/i })).not.toBeInTheDocument();
  });

  it('warns before recording a second review on the same day', async () => {
    reviewState.reviews = [review(new Date().toISOString())];
    render(<PolicyLifecycle policy={basePolicy} currentVersion={version} />);
    await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }));
    expect(screen.getByText(/already recorded today/)).toBeInTheDocument();
  });
});
