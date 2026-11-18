import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionnaireReviewSetting } from './QuestionnaireReviewSetting';

const { update, mutate, swr } = vi.hoisted(() => ({
  update: vi.fn(),
  mutate: vi.fn(),
  swr: { data: { data: { securityQuestionnaireRequiresReview: true } } as unknown },
}));
vi.mock('@/hooks/use-api-swr', () => ({ useApiSWR: () => ({ ...swr, mutate }) }));
vi.mock('@/hooks/use-trust-portal-settings', () => ({
  useTrustPortalSettings: () => ({ updateSecurityQuestionnaireRequiresReview: update }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  swr.data = { data: { securityQuestionnaireRequiresReview: true } };
});

describe('QuestionnaireReviewSetting', () => {
  it('is on by default and lets trust admins turn it off', async () => {
    swr.data = undefined;
    render(<QuestionnaireReviewSetting canUpdate />);
    const toggle = screen.getByRole('switch', { name: 'Review AI answers before sending' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() => expect(update).toHaveBeenCalledWith(false));
    expect(mutate).toHaveBeenCalled();
  });

  it('is read-only without trust:update', () => {
    render(<QuestionnaireReviewSetting canUpdate={false} />);
    expect(screen.getByRole('switch', { name: 'Review AI answers before sending' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
