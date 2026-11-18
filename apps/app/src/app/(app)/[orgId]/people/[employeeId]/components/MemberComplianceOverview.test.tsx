import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberComplianceOverview } from './MemberComplianceOverview';

const { mockUseCompliance } = vi.hoisted(() => ({ mockUseCompliance: vi.fn() }));
vi.mock('@/hooks/use-member-compliance', () => ({ useMemberCompliance: mockUseCompliance }));

const item = (overrides: object) => ({
  completedAt: null,
  dueDate: null,
  expiresAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCompliance.mockReturnValue({
    isLoading: false,
    error: undefined,
    compliance: {
      member: { id: 'mem_1' },
      completedItems: 1,
      totalItems: 3,
      items: [
        item({ key: 'policies', title: 'Accept security policies', status: 'incomplete', detail: '1 of 2 accepted' }),
        item({
          key: 'training',
          title: 'Security awareness training',
          status: 'complete',
          detail: '5 of 5 videos',
          completedAt: '2026-03-01T00:00:00Z',
          expiresAt: '2027-03-01T00:00:00Z',
        }),
        item({ key: 'onboarding', title: 'Onboarding checklist', status: 'overdue', detail: '2 of 7 items · 1 overdue' }),
        item({ key: 'background_check', title: 'Background check', status: 'not_required', detail: 'Exempt: Agency' }),
      ],
    },
  });
});

describe('MemberComplianceOverview', () => {
  it('shows progress and one row per obligation with its status', () => {
    render(<MemberComplianceOverview memberId="mem_1" availableTabs={['policies', 'training', 'onboarding']} onOpenTab={vi.fn()} />);

    expect(screen.getByText('1 of 3 requirements complete')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.getByText(/Exempt: Agency/)).toBeInTheDocument();
    expect(screen.getByText(/renews/)).toBeInTheDocument();
  });

  it('opens the matching tab and disables rows whose tab is hidden', () => {
    const onOpenTab = vi.fn();
    render(<MemberComplianceOverview memberId="mem_1" availableTabs={['policies', 'onboarding']} onOpenTab={onOpenTab} />);

    fireEvent.click(screen.getByText('Onboarding checklist'));
    expect(onOpenTab).toHaveBeenCalledWith('onboarding');
    expect(screen.getByText('Background check').closest('button')).toBeDisabled();
  });

  it('shows an error state', () => {
    mockUseCompliance.mockReturnValue({ isLoading: false, error: new Error('x'), compliance: null });
    render(<MemberComplianceOverview memberId="mem_1" availableTabs={[]} onOpenTab={vi.fn()} />);
    expect(screen.getByText(/Could not load/)).toBeInTheDocument();
  });
});
