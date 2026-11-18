import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checklistFixture } from './checklist-fixtures';
import { GettingStarted } from './GettingStarted';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const hook = {
  checklist: checklistFixture as typeof checklistFixture | null,
  error: undefined as Error | undefined,
  isLoading: false,
  mutate: vi.fn(),
  skipItem: vi.fn().mockResolvedValue(checklistFixture),
  unskipItem: vi.fn().mockResolvedValue(checklistFixture),
};
vi.mock('@/hooks/use-onboarding-checklist', () => ({ useOnboardingChecklist: () => hook }));

describe('GettingStarted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hook.checklist = checklistFixture;
    hook.error = undefined;
    hook.isLoading = false;
    setMockPermissions({ organization: ['read', 'update'], app: ['read'] });
  });

  it('shows sections with progress, deep links, references and the milestone card', () => {
    render(<GettingStarted organizationId="org_1" />);

    expect(screen.getByText('Connect key systems')).toBeInTheDocument();
    expect(screen.getAllByText('1 of 2 complete').length).toBeGreaterThan(0);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('ISO 27001 A.8.9')).toBeInTheDocument();
    expect(screen.getByText('3 of 10')).toBeInTheDocument();
    const row = screen.getByTestId('checklist-item-policies_published');
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/org_1/policies/pol_1');
  });

  it('explains locked items and hides their call to action', () => {
    render(<GettingStarted organizationId="org_1" />);
    const row = screen.getByTestId('checklist-item-auditor_access');
    expect(
      within(row).getByText('Finish first: Review and publish your policies.'),
    ).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });

  it('lets an admin skip a step with a reason and restore a skipped one', async () => {
    render(<GettingStarted organizationId="org_1" />);
    fireEvent.click(within(screen.getByTestId('checklist-item-cloud_provider')).getByText('Skip'));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'No cloud' } });
    fireEvent.click(screen.getByText('Skip step'));
    await waitFor(() =>
      expect(hook.skipItem).toHaveBeenCalledWith({ itemId: 'cloud_provider', reason: 'No cloud' }),
    );

    fireEvent.click(
      within(screen.getByTestId('checklist-item-policies_acknowledged')).getByText('Restore'),
    );
    await waitFor(() => expect(hook.unskipItem).toHaveBeenCalledWith('policies_acknowledged'));
  });

  it('requires a reason to skip', async () => {
    render(<GettingStarted organizationId="org_1" />);
    fireEvent.click(within(screen.getByTestId('checklist-item-cloud_provider')).getByText('Skip'));
    fireEvent.click(screen.getByText('Skip step'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tell your auditor why');
    expect(hook.skipItem).not.toHaveBeenCalled();
  });

  it('hides skip and restore for read-only members', () => {
    setMockPermissions({ app: ['read'] });
    render(<GettingStarted organizationId="org_1" />);
    expect(screen.queryByText('Skip')).not.toBeInTheDocument();
    expect(screen.queryByText('Restore')).not.toBeInTheDocument();
    expect(screen.getByText('Skipped: Handled in HR system')).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    hook.checklist = null;
    hook.isLoading = true;
    const { rerender } = render(<GettingStarted organizationId="org_1" />);
    expect(screen.getByLabelText('Loading setup checklist')).toBeInTheDocument();

    hook.isLoading = false;
    hook.error = new Error('boom');
    rerender(<GettingStarted organizationId="org_1" />);
    fireEvent.click(screen.getByText('Try again'));
    expect(hook.mutate).toHaveBeenCalled();
  });
});
