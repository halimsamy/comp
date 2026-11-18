import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { EmployeePolicies } from './EmployeePolicies';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const mockUseHistory = vi.fn();
vi.mock('@/hooks/use-policy-lifecycle', () => ({
  useMemberPolicyAcknowledgements: (args: { memberId: string }) => mockUseHistory(args),
  downloadAcknowledgementsCsv: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const employee = { id: 'mem_1', user: { name: 'Eve' } } as Parameters<
  typeof EmployeePolicies
>[0]['employee'];
const policy = (id: string, signedBy: string[]) =>
  ({ id, name: `Policy ${id}`, signedBy }) as Parameters<
    typeof EmployeePolicies
  >[0]['policies'][number];
const ack = (policyId: string, version: number, acknowledgedAt: string) => ({
  id: `pak_${policyId}_${version}`,
  policyId,
  policyName: `Policy ${policyId}`,
  policyVersionId: `pv_${version}`,
  version,
  memberId: 'mem_1',
  memberName: 'Eve',
  memberEmail: 'eve@acme.test',
  acknowledgedAt,
});

describe('EmployeePolicies', () => {
  beforeEach(() => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockUseHistory.mockReturnValue({
      history: [ack('a', 3, '2026-10-02T12:00:00Z'), ack('b', 1, '2026-01-05T12:00:00Z')],
    });
  });

  it('shows which version each policy was acknowledged and when', () => {
    render(
      <EmployeePolicies employee={employee} policies={[policy('a', ['mem_1']), policy('b', [])]} />,
    );
    expect(screen.getByText('Acknowledged v3 on Oct 2, 2026')).toBeInTheDocument();
    expect(
      screen.getByText('New version pending · last signed v1 on Jan 5, 2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export acknowledgements/i })).toBeInTheDocument();
  });

  it('does not request history or offer export without policy:read', () => {
    setMockPermissions({});
    mockUseHistory.mockReturnValue({ history: [] });
    render(<EmployeePolicies employee={employee} policies={[policy('a', [])]} />);
    expect(mockUseHistory).toHaveBeenLastCalledWith({ memberId: '' });
    expect(screen.getByText('Not acknowledged yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });
});
