import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsReadiness } from '../../hooks/useIsmsReadiness';
import { IsmsReadinessPanel } from './IsmsReadinessPanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const readiness: IsmsReadiness = {
  percent: 50,
  documents: [
    {
      type: 'monitoring',
      documentId: 'd1',
      status: 'draft',
      checks: [
        { label: 'Define active metrics with a cadence', done: true },
        { label: 'Approve and publish the document', done: false },
      ],
      percent: 50,
      missing: ['Approve and publish the document'],
    },
  ],
  nonconformities: { open: 3, overdue: 1 },
};

const baseProps = {
  organizationId: 'org_1',
  readiness,
  isLoading: false,
  error: undefined,
  onRefresh: vi.fn().mockResolvedValue(undefined),
};

describe('IsmsReadinessPanel', () => {
  it('shows overall progress and open nonconformities', () => {
    render(<IsmsReadinessPanel {...baseProps} canRefresh />);
    expect(screen.getByText('1 of 2 steps · 50%')).toBeInTheDocument();
    expect(screen.getByText(/3 open/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/org_1/documents/isms/nonconformities',
    );
  });

  it('refreshes drafts for a user who can edit', async () => {
    render(<IsmsReadinessPanel {...baseProps} canRefresh />);
    fireEvent.click(screen.getByText('Refresh drafts'));
    await waitFor(() => expect(baseProps.onRefresh).toHaveBeenCalled());
  });

  it('hides the refresh for a read-only user', () => {
    render(<IsmsReadinessPanel {...baseProps} canRefresh={false} />);
    expect(screen.queryByText('Refresh drafts')).not.toBeInTheDocument();
  });

  it('reports a load failure', () => {
    render(
      <IsmsReadinessPanel {...baseProps} readiness={undefined} error={new Error('x')} canRefresh />,
    );
    expect(screen.getByText('Could not load progress.')).toBeInTheDocument();
  });
});
