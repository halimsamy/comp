import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalReviewBanner } from './ExternalReviewBanner';

const { post, hasPermission, refresh } = vi.hoisted(() => ({
  post: vi.fn(),
  hasPermission: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { post } }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
});

describe('ExternalReviewBanner', () => {
  it('lets questionnaire editors approve and send pending answers', async () => {
    hasPermission.mockReturnValue(true);
    render(
      <ExternalReviewBanner
        questionnaireId="qst_1"
        reviewStatus="pending_review"
        requesterEmail="buyer@x.com"
        reviewedAt={null}
        answeredCount={3}
        totalCount={3}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/questionnaire/qst_1/approve-external'));
    expect(refresh).toHaveBeenCalled();
    expect(hasPermission).toHaveBeenCalledWith('questionnaire', 'update');
  });

  it('asks for confirmation before sending blank answers', async () => {
    hasPermission.mockReturnValue(true);
    render(
      <ExternalReviewBanner
        questionnaireId="qst_1"
        reviewStatus="pending_review"
        requesterEmail="buyer@x.com"
        reviewedAt={null}
        answeredCount={1}
        totalCount={3}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    expect(post).not.toHaveBeenCalled();
    expect(await screen.findByText(/2 of 3 questions have no answer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send anyway' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/questionnaire/qst_1/approve-external'));
  });

  it('hides the approve button without questionnaire:update', () => {
    hasPermission.mockReturnValue(false);
    render(
      <ExternalReviewBanner
        questionnaireId="qst_1"
        reviewStatus="pending_review"
        requesterEmail="buyer@x.com"
        reviewedAt={null}
        answeredCount={3}
        totalCount={3}
      />,
    );
    expect(screen.getByText('Waiting for your review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and send' })).not.toBeInTheDocument();
  });

  it('shows when the answers were sent and renders nothing for internal questionnaires', () => {
    hasPermission.mockReturnValue(true);
    const { rerender, container } = render(
      <ExternalReviewBanner
        questionnaireId="qst_1"
        reviewStatus="approved"
        requesterEmail="buyer@x.com"
        reviewedAt="2026-11-18T10:00:00Z"
        answeredCount={3}
        totalCount={3}
      />,
    );
    expect(screen.getByText('Answers sent')).toBeInTheDocument();
    rerender(
      <ExternalReviewBanner questionnaireId="qst_1" reviewStatus={null} requesterEmail={null} reviewedAt={null} answeredCount={0} totalCount={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
