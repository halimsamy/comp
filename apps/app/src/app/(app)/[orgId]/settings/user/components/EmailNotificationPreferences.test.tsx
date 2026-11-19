import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSave = vi.fn();
vi.mock('../hooks/useEmailPreferences', () => ({
  useEmailPreferences: () => ({ savePreferences: mockSave }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./DigestFrequencySelect', () => ({
  DigestFrequencySelect: ({ label, disabled }: { label?: string; disabled?: boolean }) => (
    <div data-testid="frequency" data-disabled={String(!!disabled)}>
      {label ?? 'Digest frequency'}
    </div>
  ),
}));

import { EmailNotificationPreferences } from './EmailNotificationPreferences';

const base = {
  policyNotifications: true,
  taskReminders: true,
  weeklyTaskDigest: true,
  unassignedItemsNotifications: true,
  taskMentions: true,
  taskAssignments: true,
};

const checkbox = (label: string) =>
  screen
    .getByText(label)
    .closest('label')
    ?.querySelector('[role="checkbox"], input') as HTMLElement;

describe('EmailNotificationPreferences', () => {
  beforeEach(() => mockSave.mockReset().mockResolvedValue(undefined));

  it('defaults the new notification types to on for users who saved before they existed', async () => {
    render(<EmailNotificationPreferences initialPreferences={base} email="ann@spare.co" />);
    expect(screen.getByText('Ownership')).toBeInTheDocument();
    expect(screen.getByText('SLA Alerts')).toBeInTheDocument();
    expect(screen.getByText('Compliance Digest')).toBeInTheDocument();
    expect(screen.getByText('Compliance digest frequency')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      complianceDigest: true,
      ownershipAssignments: true,
      slaAlerts: true,
      digestFrequency: 'weekly',
      complianceDigestFrequency: 'weekly',
    });
  });

  it('saves an ownership opt-out', async () => {
    render(<EmailNotificationPreferences initialPreferences={base} email="ann@spare.co" />);
    fireEvent.click(checkbox('Ownership'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][0].ownershipAssignments).toBe(false);
  });

  it('locks role-managed types for non-admins and follows the role matrix', () => {
    render(
      <EmailNotificationPreferences
        initialPreferences={base}
        email="ann@spare.co"
        isAdminOrOwner={false}
        roleNotifications={{
          policyNotifications: true,
          taskReminders: false,
          taskAssignments: false,
          taskMentions: false,
          weeklyTaskDigest: false,
          findingNotifications: false,
          complianceDigest: false,
          ownershipAssignments: true,
          slaAlerts: false,
        }}
      />,
    );
    expect(screen.getAllByText('Managed by your organization admin').length).toBeGreaterThan(0);
    const frequencies = screen.getAllByTestId('frequency');
    expect(frequencies[1]).toHaveAttribute('data-disabled', 'true');
  });
});
