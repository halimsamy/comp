import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { PolicyAcknowledgementsTab } from './PolicyAcknowledgementsTab';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const mockSendReminder = vi.fn();
const mockDownload = vi.fn();
vi.mock('@/hooks/use-policy-lifecycle', () => ({
  usePolicyAcknowledgements: () => ({
    isLoading: false,
    sendReminder: mockSendReminder,
    acknowledgements: {
      policyId: 'pol_1',
      policyName: 'Access Control',
      isRequiredToSign: true,
      status: 'published',
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
  });

  it('shows who acknowledged which version and keeps older sign-offs', () => {
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    expect(screen.getByText('1 of 2 acknowledged')).toBeInTheDocument();
    expect(screen.getByText(/Last signed v1 on Jan 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Bob signed v1')).toBeInTheDocument();
  });

  it('filters to pending employees', async () => {
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    await userEvent.click(screen.getByRole('tab', { name: /pending/i }));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('lets an admin remind pending employees and export CSV', async () => {
    mockSendReminder.mockResolvedValue({ sent: 1, skipped: 0, pending: 1 });
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    await userEvent.click(screen.getByRole('button', { name: /remind 1 pending/i }));
    expect(mockSendReminder).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));
    expect(mockDownload).toHaveBeenCalledWith({ policyId: 'pol_1' });
  });

  it('hides reminders from read-only users but keeps the export', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<PolicyAcknowledgementsTab policyId="pol_1" />);
    expect(screen.queryByRole('button', { name: /remind/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });
});
