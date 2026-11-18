import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlOwnerSelect } from './ControlOwnerSelect';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const useOrganizationMembers = vi.fn(() => ({
  members: [{ id: 'mem_ada', deactivated: false, user: { name: 'Ada', email: 'ada@x.io' } }],
}));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => useOrganizationMembers(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const bob = { id: 'mem_bob', deactivated: true, user: { name: 'Bob', email: 'bob@x.io' } };

describe('ControlOwnerSelect', () => {
  it('shows the owner read-only without control:update and skips the member list', () => {
    setMockPermissions({ control: ['read'] });
    useOrganizationMembers.mockClear();
    render(<ControlOwnerSelect controlId="ctl_1" owner={bob} />);
    expect(screen.getByText('Owner: Bob (left, needs reassignment)')).toBeInTheDocument();
    expect(useOrganizationMembers).not.toHaveBeenCalled();
  });

  it('shows Unassigned for a control without owner', () => {
    setMockPermissions({ control: ['read'] });
    render(<ControlOwnerSelect controlId="ctl_1" owner={null} />);
    expect(screen.getByText('Owner: Unassigned')).toBeInTheDocument();
  });

  it('lets editors pick an owner, keeping a departed owner visible', () => {
    setMockPermissions({ control: ['read', 'update'] });
    render(<ControlOwnerSelect controlId="ctl_1" owner={bob} />);
    expect(screen.getByRole('combobox', { name: 'Control owner' })).toHaveTextContent(
      'Bob (left, needs reassignment)',
    );
  });
});
