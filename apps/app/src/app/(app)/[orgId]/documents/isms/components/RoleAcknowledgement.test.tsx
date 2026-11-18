import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsmsRoleAssignment } from '../isms-types';
import { RoleAcknowledgement } from './RoleAcknowledgement';

const activeMember: { data: { id: string } | null } = { data: null };
vi.mock('@/utils/auth-client', () => ({ useActiveMember: () => activeMember }));

const mockPost = vi.fn();
vi.mock('@/lib/api-client', () => ({ api: { post: (...args: unknown[]) => mockPost(...args) } }));

const mockMutate = vi.fn();
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: mockMutate }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const assignment = (overrides: Partial<IsmsRoleAssignment> = {}) =>
  ({
    id: 'isms_ra_1',
    memberId: 'mem_holder',
    acknowledgedAt: null,
    acknowledgedByMemberId: null,
    ...overrides,
  }) as IsmsRoleAssignment;

describe('RoleAcknowledgement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeMember.data = null;
  });

  it('shows the acknowledgement date once accepted', () => {
    render(
      <RoleAcknowledgement assignment={assignment({ acknowledgedAt: '2026-11-02T10:00:00Z' })} />,
    );
    expect(screen.getByText(/Acknowledged/)).toBeInTheDocument();
    expect(screen.queryByText('I accept this role')).not.toBeInTheDocument();
  });

  it('shows only the pending status to someone other than the holder', () => {
    activeMember.data = { id: 'mem_admin' };
    render(<RoleAcknowledgement assignment={assignment()} />);
    expect(screen.getByText('Awaiting acknowledgement')).toBeInTheDocument();
    expect(screen.queryByText('I accept this role')).not.toBeInTheDocument();
  });

  it('lets the holder accept the role', async () => {
    activeMember.data = { id: 'mem_holder' };
    mockPost.mockResolvedValue({ data: {}, error: null });
    render(<RoleAcknowledgement assignment={assignment()} />);
    fireEvent.click(screen.getByText('I accept this role'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/v1/isms/role-assignments/isms_ra_1/acknowledge', {}),
    );
    expect(mockMutate).toHaveBeenCalled();
  });
});
