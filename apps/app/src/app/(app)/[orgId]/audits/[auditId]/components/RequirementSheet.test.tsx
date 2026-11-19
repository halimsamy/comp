import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { REQUIREMENT } from '../../lib/audits.fixtures';
import { RequirementSheet } from './RequirementSheet';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./AuditCommentsThread', () => ({ AuditCommentsThread: () => <div>comments</div> }));
const createFinding = vi.fn().mockResolvedValue({ id: 'fnd_1' });
vi.mock('@/hooks/use-findings-api', async (importActual) => ({
  ...(await importActual<typeof import('@/hooks/use-findings-api')>()),
  useFindingActions: () => ({ createFinding }),
}));

const base = {
  orgId: 'org_1',
  auditId: 'aud_1',
  frameworkName: 'ISO 27001',
  requirement: REQUIREMENT,
  canRaiseFinding: false,
  onOpenChange: vi.fn(),
};

const flagged = {
  ...REQUIREMENT,
  review: {
    status: 'flagged' as const,
    note: 'Q2 access review missing',
    reviewedAt: '2026-11-01T00:00:00.000Z',
    reviewedBy: { name: 'Ann', email: 'ann@cb.com' },
  },
};

describe('RequirementSheet', () => {
  it('shows linked evidence with needs-update and links to it', () => {
    render(<RequirementSheet {...base} canAssess={false} onReview={vi.fn()} />);
    // Requirement status and the task both say so.
    expect(screen.getAllByText('Needs update')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Quarterly access review' })).toHaveAttribute(
      'href',
      '/org_1/tasks/tsk_1',
    );
    expect(screen.getByRole('link', { name: 'Access Control Policy' })).toBeInTheDocument();
  });

  it('hides assessment actions from the team', () => {
    render(<RequirementSheet {...base} canAssess={false} onReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Flag/ })).not.toBeInTheDocument();
  });

  it('lets the assigned auditor flag with a note', () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    render(<RequirementSheet {...base} canAssess onReview={onReview} />);
    fireEvent.change(screen.getByLabelText('Assessment note'), { target: { value: 'Q2 missing' } });
    fireEvent.click(screen.getByRole('button', { name: /Flag/ }));
    expect(onReview).toHaveBeenCalledWith({ status: 'flagged', note: 'Q2 missing' });
  });

  it('raises a finding from a flagged requirement with the auditor note (#171)', async () => {
    render(<RequirementSheet {...base} requirement={flagged} canAssess canRaiseFinding onReview={vi.fn()} />);
    expect(screen.getByLabelText('Finding')).toHaveValue('Q2 access review missing');
    fireEvent.click(screen.getByRole('button', { name: /Raise finding/ }));
    await waitFor(() =>
      expect(createFinding).toHaveBeenCalledWith({
        area: 'compliance',
        type: 'iso27001',
        severity: 'medium',
        content: 'A.5.15 Access control: Q2 access review missing',
        auditId: 'aud_1',
        requirementId: 'req_1',
      }),
    );
    expect(await screen.findByRole('link', { name: 'Open it in Findings' })).toHaveAttribute(
      'href',
      '/org_1/audits?tab=findings&open=fnd_1',
    );
  });

  it('hides Raise finding without finding:create', () => {
    render(<RequirementSheet {...base} requirement={flagged} canAssess onReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Raise finding/ })).not.toBeInTheDocument();
  });
});
