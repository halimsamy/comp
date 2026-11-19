import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventLog } from './EventLog';

const { useAuditEvents, downloadEventLogCsv } = vi.hoisted(() => ({
  useAuditEvents: vi.fn(),
  downloadEventLogCsv: vi.fn(),
}));
vi.mock('@/hooks/use-audit-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-audit-events')>()),
  useAuditEvents,
}));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => ({
    members: [{ user: { id: 'usr_1', name: 'Ann', email: 'ann@x.com' } }],
  }),
}));
vi.mock('@/lib/evidence-download', () => ({ downloadEventLogCsv }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const signIn = {
  id: 'aud_1',
  timestamp: '2026-11-18T10:00:00Z',
  description: 'Signed in with Google',
  entityType: null,
  entityId: null,
  data: { resource: 'auth', permission: 'sign_in', ipAddress: '1.2.3.4' },
  user: { id: 'usr_1', name: 'Ann', email: 'ann@x.com', image: null },
};
const failed = {
  ...signIn,
  id: 'aud_2',
  description: 'Failed sign-in attempt (invalid email code)',
  data: { resource: 'auth', permission: 'sign_in_failed' },
};

beforeEach(() => {
  vi.clearAllMocks();
  downloadEventLogCsv.mockResolvedValue(undefined);
});

describe('EventLog', () => {
  it('lists events with user, IP and type', () => {
    useAuditEvents.mockReturnValue({ events: [signIn, failed], count: 2, isLoading: false });
    render(<EventLog />);
    expect(screen.getAllByText('Signed in with Google').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IP 1.2.3.4').length).toBeGreaterThan(0);
    // Each event renders as a card (phones) and a table row (md+).
    expect(screen.getAllByText('Sign-ins and sessions')).toHaveLength(4);
    expect(screen.getByText('Showing 1–2 of 2 events')).toBeInTheDocument();
  });

  it('shows guidance when nothing matches', () => {
    useAuditEvents.mockReturnValue({ events: [], count: 0, isLoading: false });
    render(<EventLog />);
    expect(screen.getByText('No events found')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    useAuditEvents.mockReturnValue({
      events: [],
      count: 0,
      isLoading: false,
      error: new Error('x'),
    });
    render(<EventLog />);
    expect(screen.getByText(/couldn.t be loaded/)).toBeInTheDocument();
  });

  it('filters by date and exports the same filters as CSV', async () => {
    useAuditEvents.mockReturnValue({ events: [signIn], count: 1, isLoading: false });
    render(<EventLog />);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    expect(useAuditEvents).toHaveBeenLastCalledWith({
      filters: { from: '2026-01-01', search: undefined },
      page: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(downloadEventLogCsv).toHaveBeenCalledWith('from=2026-01-01'));
  });

  it('pages through results', () => {
    useAuditEvents.mockReturnValue({ events: [signIn], count: 120, isLoading: false });
    render(<EventLog />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(useAuditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('opens a detail sheet with the diff, IP, user agent and failure status', async () => {
    const change = {
      ...signIn,
      id: 'aud_3',
      description: 'Failed: Updated policy',
      entityType: 'policy',
      entityId: 'pol_1',
      data: {
        resource: 'policy',
        outcome: 'failure',
        statusCode: 403,
        ipAddress: '5.6.7.8',
        userAgent: 'Mozilla/5.0 (Mac)',
        entityName: 'Access Control Policy',
        changes: { status: { previous: 'draft', current: 'published' } },
      },
    };
    useAuditEvents.mockReturnValue({ events: [change], count: 1, isLoading: false });
    render(<EventLog />);
    fireEvent.click(screen.getByRole('row', { name: /Open event: Failed: Updated policy/ }));
    expect(await screen.findByText('Mozilla/5.0 (Mac)')).toBeInTheDocument();
    expect(screen.getByText('Failed (403)')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('labels the date range filters', () => {
    useAuditEvents.mockReturnValue({ events: [], count: 0, isLoading: false });
    render(<EventLog />);
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
  });
});
