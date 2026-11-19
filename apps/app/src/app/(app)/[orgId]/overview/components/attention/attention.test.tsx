import type { AttentionCard, Deadlines } from '@/hooks/use-overview';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttentionGrid } from './AttentionGrid';
import { ComplianceTrendCard, toChartRows } from './ComplianceTrendCard';
import { DeadlinesCard, formatDue } from './DeadlinesCard';

const state = {
  attention: {
    cards: null as AttentionCard[] | null,
    isLoading: false,
    hasError: false,
    mutate: vi.fn(),
  },
  deadlines: {
    deadlines: null as Deadlines | null,
    isLoading: false,
    hasError: false,
    mutate: vi.fn(),
  },
  trends: { frameworks: null as unknown, isLoading: false, hasError: false, mutate: vi.fn() },
};

vi.mock('@/hooks/use-overview', () => ({
  useOverviewAttention: () => state.attention,
  useOverviewDeadlines: () => state.deadlines,
  useComplianceTrends: () => state.trends,
}));

const cards: AttentionCard[] = [
  {
    module: 'tasks',
    label: 'Evidence tasks',
    needsAttention: 4,
    ok: 2,
    total: 6,
    href: '/tasks',
    reasons: [
      { label: 'Overdue', count: 1 },
      { label: 'Failed', count: 3, href: '/tasks?status=failed' },
    ],
  },
  {
    module: 'vendors',
    label: 'Vendors',
    needsAttention: 0,
    ok: 5,
    total: 5,
    href: '/vendors',
    reasons: [],
  },
  {
    module: 'checks',
    label: 'Integration checks',
    needsAttention: 0,
    ok: 0,
    total: 0,
    href: '/integrations',
    reasons: [],
  },
];

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();

describe('AttentionGrid', () => {
  beforeEach(() => {
    state.attention = { cards, isLoading: false, hasError: false, mutate: vi.fn() };
  });

  it('renders a card per module with counts, reasons and a deep link', () => {
    render(<AttentionGrid organizationId="org_1" />);
    const tasks = screen.getByTestId('attention-card-tasks');
    expect(within(tasks).getByRole('link', { name: 'Evidence tasks' })).toHaveAttribute(
      'href',
      '/org_1/tasks',
    );
    expect(within(tasks).getByRole('link', { name: '3 failed' })).toHaveAttribute(
      'href',
      '/org_1/tasks?status=failed',
    );
    expect(within(tasks).getByText('4')).toBeInTheDocument();
    expect(within(tasks).getByText('2 of 6 OK')).toBeInTheDocument();
    expect(within(tasks).getByText('failed')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('attention-card-vendors')).getByText('All OK'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 items need attention')).toBeInTheDocument();
  });

  it('guides the user when a module has no data yet', () => {
    render(<AttentionGrid organizationId="org_1" />);
    expect(
      within(screen.getByTestId('attention-card-checks')).getByText(/Connect an integration/),
    ).toBeInTheDocument();
  });

  it('shows a retry on error', () => {
    const mutate = vi.fn();
    state.attention = { cards: null, isLoading: false, hasError: true, mutate };
    render(<AttentionGrid organizationId="org_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mutate).toHaveBeenCalled();
  });
});

describe('DeadlinesCard', () => {
  beforeEach(() => {
    state.deadlines = {
      deadlines: {
        windowDays: 30,
        overdueCount: 1,
        dueSoonCount: 0,
        overdue: [
          {
            id: 'tsk_1',
            type: 'task',
            title: 'Vulnerability scan',
            subtitle: 'Evidence task',
            dueDate: iso(-3),
            href: '/tasks/tsk_1',
            ownerName: 'Ana',
          },
        ],
        dueSoon: [],
        noDueDateCount: 0,
        noDueDate: [],
      },
      isLoading: false,
      hasError: false,
      mutate: vi.fn(),
    };
  });

  it('lists overdue items with owner, relative date and link', () => {
    render(<DeadlinesCard organizationId="org_1" />);
    expect(screen.getByText('Overdue (1)')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Vulnerability scan/ });
    expect(link).toHaveAttribute('href', '/org_1/tasks/tsk_1');
    expect(within(link).getByText('Evidence task · Ana')).toBeInTheDocument();
    expect(within(link).getByText('3 days overdue')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is overdue', () => {
    state.deadlines.deadlines = {
      windowDays: 30,
      overdueCount: 0,
      dueSoonCount: 0,
      overdue: [],
      dueSoon: [],
      noDueDateCount: 0,
      noDueDate: [],
    };
    render(<DeadlinesCard organizationId="org_1" />);
    expect(screen.getByText('Nothing is overdue.')).toBeInTheDocument();
  });

  it('does not report all clear while open items have no due date', () => {
    state.deadlines.deadlines = {
      windowDays: 30,
      overdueCount: 0,
      dueSoonCount: 0,
      overdue: [],
      dueSoon: [],
      noDueDateCount: 1,
      noDueDate: [
        {
          id: 'access-request',
          type: 'form',
          title: 'Access request',
          subtitle: 'Company form · never submitted',
          dueDate: null,
          href: '/documents/access-request',
          ownerName: null,
        },
      ],
    };
    render(<DeadlinesCard organizationId="org_1" />);
    expect(screen.getByText(/1 item has no due date/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review items without a due date' }));
    expect(screen.getByRole('link', { name: /Access request/ })).toHaveAttribute(
      'href',
      '/org_1/documents/access-request',
    );
  });

  it('formats relative due dates', () => {
    const base = new Date('2026-11-18T12:00:00Z');
    expect(formatDue({ dueDate: '2026-11-18T12:00:00Z', now: base })).toBe('Due today');
    expect(formatDue({ dueDate: '2026-11-19T12:00:00Z', now: base })).toBe('Due tomorrow');
    expect(formatDue({ dueDate: '2026-11-17T12:00:00Z', now: base })).toBe('1 day overdue');
    expect(formatDue({ dueDate: '2026-11-28T12:00:00Z', now: base })).toBe('Due in 10 days');
  });
});

describe('ComplianceTrendCard', () => {
  it('explains when no snapshot exists yet', () => {
    state.trends = { frameworks: [], isLoading: false, hasError: false, mutate: vi.fn() };
    render(<ComplianceTrendCard />);
    expect(screen.getByText(/daily snapshot/)).toBeInTheDocument();
  });

  it('shows when tracking started while there is a single snapshot', () => {
    state.trends = {
      frameworks: [
        {
          frameworkInstanceId: 'fi_iso',
          frameworkName: 'ISO 27001',
          points: [{ date: '2026-11-18', scorePercent: 50, controlsComplete: 1, controlsTotal: 2 }],
        },
      ],
      isLoading: false,
      hasError: false,
      mutate: vi.fn(),
    };
    render(<ComplianceTrendCard />);
    expect(screen.getByText(/Tracking since Nov 18/)).toBeInTheDocument();
    expect(screen.queryByTestId('compliance-trend-chart')).not.toBeInTheDocument();
  });

  it('merges framework series into one row per day', () => {
    const rows = toChartRows([
      {
        frameworkInstanceId: 'fi_iso',
        frameworkName: 'ISO 27001',
        points: [
          { date: '2026-11-17', scorePercent: 50, controlsComplete: 1, controlsTotal: 2 },
          { date: '2026-11-18', scorePercent: 55, controlsComplete: 1, controlsTotal: 2 },
        ],
      },
      {
        frameworkInstanceId: 'fi_pci',
        frameworkName: 'PCI DSS',
        points: [{ date: '2026-11-18', scorePercent: 30, controlsComplete: 1, controlsTotal: 3 }],
      },
    ]);
    expect(rows).toEqual([
      { date: '2026-11-17', score_0: 50 },
      { date: '2026-11-18', score_0: 55, score_1: 30 },
    ]);
  });
});
