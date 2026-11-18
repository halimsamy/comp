import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { REQUIREMENT } from '../../lib/audits.fixtures';
import { RequirementSheet } from './RequirementSheet';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./AuditCommentsThread', () => ({ AuditCommentsThread: () => <div>comments</div> }));

const base = {
  orgId: 'org_1',
  auditId: 'aud_1',
  requirement: REQUIREMENT,
  onOpenChange: vi.fn(),
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
});
