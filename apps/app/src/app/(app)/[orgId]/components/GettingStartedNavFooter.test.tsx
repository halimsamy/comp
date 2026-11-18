import type { OnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GettingStartedNavFooter } from './GettingStartedNavFooter';

const state: { checklist: OnboardingChecklist | null; enabled?: boolean } = { checklist: null };
vi.mock('@/hooks/use-onboarding-checklist', () => ({
  useOnboardingChecklist: ({ enabled }: { enabled: boolean }) => {
    state.enabled = enabled;
    return { checklist: state.checklist };
  },
}));

const checklist = (overrides: Partial<OnboardingChecklist> = {}): OnboardingChecklist => ({
  sections: [],
  completed: 7,
  total: 19,
  percent: 37,
  isComplete: false,
  ...overrides,
});

describe('GettingStartedNavFooter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.checklist = checklist();
  });

  it('shows setup progress linking to the guide for members who manage the org', () => {
    render(<GettingStartedNavFooter organizationId="org_1" canManage isActive={false} />);
    expect(screen.getByText('7/19 steps completed')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/org_1/getting-started');
  });

  it('does not fetch or render for members without organization:update', () => {
    render(<GettingStartedNavFooter organizationId="org_1" canManage={false} isActive={false} />);
    expect(state.enabled).toBe(false);
    expect(screen.queryByText('Finish setup')).not.toBeInTheDocument();
  });

  it('hides once setup is complete', () => {
    state.checklist = checklist({ isComplete: true, completed: 19, percent: 100 });
    render(<GettingStartedNavFooter organizationId="org_1" canManage isActive={false} />);
    expect(screen.queryByText('Finish setup')).not.toBeInTheDocument();
  });

  it('can be dismissed and stays dismissed for this browser', () => {
    const { unmount } = render(
      <GettingStartedNavFooter organizationId="org_1" canManage isActive={false} />,
    );
    fireEvent.click(screen.getByLabelText('Hide setup progress'));
    expect(screen.queryByText('Finish setup')).not.toBeInTheDocument();
    unmount();
    render(<GettingStartedNavFooter organizationId="org_1" canManage isActive={false} />);
    expect(screen.queryByText('Finish setup')).not.toBeInTheDocument();
  });
});
