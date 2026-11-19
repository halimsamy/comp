import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { PolicyAcknowledgementsTab, reminderToastMessage } from './PolicyAcknowledgementsTab';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const mockSendReminder = vi.fn();
const mockDownload = vi.fn();
const mockMutate = vi.fn();
const state = { inForce: true };
vi.mock('@/hooks/use-policy-lifecycle', () => ({
  usePolicyAcknowledgements: () => ({
    isLoading: false,
    sendReminder: mockSendReminder,
    mutate: mockMutate,
    acknowledgements: {
      policyId: 'pol_1',
      policyName: 'Access Control',
      isRequiredToSign: true,
      status: 'published',
      inForce: state.inForce,
      currentVersion: { id: 'pv_2', version: 2 },
      summary: { total: 2, acknowledged: 1, pending: 1 },
      members: [
        {
          memberId: 'mem_a',
          name: 'Alice',
          email: 'alice@acme.test',
          department: 'it',
          status: 'acknowledged',
          acknowledgedAt: '2026-10-02T00:00:00Z',
          lastAcknowledgedAt: '2026-10-02T00:00:00Z',
          lastAcknowledgedVersion: 2,
          lastRemindedAt: null,
        },
        {
          memberId: 'mem_b',
          name: 'Bob',
          email: 'bob@acme.test',
          department: 'it',
          status: 'pending',
          acknowledgedAt: null,
          lastAcknowledgedAt: '2026-01-05T00:00:00Z',
          lastAcknowledgedVersion: 1,
          lastRemindedAt: '2026-11-10T09:00:00Z',
        },
      ],
      history: [
        {
          id: 'pak_1',
          policyId: 'pol_1',
          policyName: 'Access Control',
          policyVersionId: 'pv_1',
          version: 1,
          memberId: 'mem_b',
          memberName: 'Bob',
          memberEmail: 'bob@acme.test',
          acknowledgedAt: '2026-01-05T00:00:00Z',
        },
      ],
    },
  }),
  downloadAcknowledgementsCsv: (...args: unknown[]) => mockDownload(...args),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('PolicyAcknowledgementsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockPermissions(ADMIN_PERMISSIONS);
    state.inForce = true;
  });

  it('shows who acknowledged which version and keeps older sign-offs', () => {
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    expect(screen.getByText('1 of 2 acknowledged')).toBeInTheDocument();
    expect(screen.getAllByText(/Last signed v1 on Jan 5, 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nov 10, 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText('Bob signed v1')).toBeInTheDocument();
  });

  it('filters to pending employees', async () => {
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    await userEvent.click(screen.getByRole('tab', { name: /pending/i }));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('lets an admin remind pending employees and export CSV', async () => {
    mockSendReminder.mockResolvedValue({
      sent: 1,
      alreadyRemindedToday: 0,
      unsubscribed: 0,
      failed: 0,
      pending: 1,
    });
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    await userEvent.click(screen.getByRole('button', { name: /remind 1 pending/i }));
    expect(mockSendReminder).toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(mockDownload).toHaveBeenCalledWith({ policyId: 'pol_1' });
  });

  it('hides reminders from read-only users but keeps the export', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    expect(screen.queryByRole('button', { name: /remind/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('shows an empty state instead of pending employees when no version is approved', () => {
    state.inForce = false;
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    expect(screen.getByText('No approved version yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remind/i })).not.toBeInTheDocument();
  });
});

describe('reminderToastMessage', () => {
  it('explains who was skipped', () => {
    expect(
      reminderToastMessage({ sent: 2, alreadyRemindedToday: 3, unsubscribed: 1, failed: 0, pending: 6 }),
    ).toBe('Reminder sent to 2 employees · 3 already reminded today · 1 unsubscribed');
    expect(
      reminderToastMessage({ sent: 0, alreadyRemindedToday: 1, unsubscribed: 0, failed: 0, pending: 1 }),
    ).toBe('No reminders sent · 1 already reminded today');
  });
});
