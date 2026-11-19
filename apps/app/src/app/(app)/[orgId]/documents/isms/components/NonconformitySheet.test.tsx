import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsNonconformityRow } from '../hooks/useNonconformities';
import { NonconformitySheet } from './NonconformitySheet';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row: IsmsNonconformityRow = {
  id: 'f1',
  kind: 'audit_finding',
  reference: 'IA-2026-01 F-02',
  source: 'internal_audit',
  sourceRef: 'A.8.13',
  severity: 'minor',
  description: 'Backup restore was never tested',
  rootCause: null,
  correctiveAction: null,
  ownerMemberId: 'mem_gone',
  dueDate: '2026-12-01T00:00:00.000Z',
  status: 'open',
  closureEvidence: null,
  effectivenessReviewedAt: null,
  effectivenessReviewedById: null,
  effectivenessNotes: null,
  createdAt: '2026-10-01T00:00:00Z',
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  memberOptions: [{ id: 'mem_1', name: 'Dana' }],
  canEdit: true,
};

describe('NonconformitySheet', () => {
  it('sends only the changed corrective-action fields for an audit finding', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NonconformitySheet {...baseProps} row={row} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Nonconformity')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Root cause'), {
      target: { value: 'No restore test in the backup procedure' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        rootCause: 'No restore test in the backup procedure',
      }),
    );
  });

  it('requires a description for a new nonconformity', async () => {
    const onSubmit = vi.fn();
    render(<NonconformitySheet {...baseProps} row={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Log nonconformity'));
    expect(await screen.findByText('Describe what requirement was not met')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is read-only without edit permission', () => {
    render(<NonconformitySheet {...baseProps} canEdit={false} row={row} onSubmit={vi.fn()} />);
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('shows the owner and status by name, not by id (#38)', () => {
    render(
      <NonconformitySheet
        {...baseProps}
        row={{ ...row, kind: 'standalone', source: 'incident', ownerMemberId: 'mem_1', status: 'in_progress' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Owner')).toHaveTextContent('Dana');
    expect(screen.getByLabelText('Owner')).not.toHaveTextContent('mem_1');
    expect(screen.getByLabelText('Status')).toHaveTextContent('In progress');
    expect(screen.getByLabelText('Source')).toHaveTextContent('Security incident');
  });

  it('does not offer External audit as a source for a new entry (#171)', () => {
    render(<NonconformitySheet {...baseProps} row={null} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Source')).toHaveTextContent('Security incident');
    expect(screen.queryByText('External audit')).not.toBeInTheDocument();
  });
});
