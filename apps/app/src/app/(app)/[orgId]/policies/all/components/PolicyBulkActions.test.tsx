import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Picks the first member as soon as the dialog opens.
vi.mock('@/components/SelectAssignee', () => ({
  SelectAssignee: ({ onAssigneeChange }: { onAssigneeChange: (id: string) => void }) => (
    <button type="button" onClick={() => onAssigneeChange('mem_approver')}>
      pick member
    </button>
  ),
}));

import type { PolicyRegisterRow } from '../../lib/policy-register';
import { PolicyBulkActions } from './PolicyBulkActions';

const policy = (id: string, overrides: Partial<PolicyRegisterRow> = {}) =>
  ({ id, name: id, approverId: null, pendingVersionId: null, ...overrides }) as PolicyRegisterRow;

describe('PolicyBulkActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits every selected policy in one bulk request', async () => {
    mockPost.mockResolvedValue({ data: { submitted: 2, skipped: [] } });
    const onDone = vi.fn();
    render(
      <PolicyBulkActions
        selected={[policy('p1'), policy('p2')]}
        members={[]}
        currentMemberId="mem_me"
        onDone={onDone}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Submit 2 for approval' }));
    await userEvent.click(screen.getByRole('button', { name: 'pick member' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));

    expect(mockPost).toHaveBeenCalledWith('/v1/policies/bulk/submit-for-approval', {
      policyIds: ['p1', 'p2'],
      approverId: 'mem_approver',
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('offers "Approve selected" only when every selected policy awaits my approval', () => {
    const mine = policy('p1', { approverId: 'mem_me', pendingVersionId: 'pv_1' });
    const { rerender } = render(
      <PolicyBulkActions selected={[mine]} members={[]} currentMemberId="mem_me" onDone={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Approve selected' })).toBeInTheDocument();

    rerender(
      <PolicyBulkActions
        selected={[mine, policy('p2')]}
        members={[]}
        currentMemberId="mem_me"
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Approve selected' })).not.toBeInTheDocument();
  });
});
