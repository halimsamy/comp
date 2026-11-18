import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';
import { RiskActionTracker } from './RiskActionTracker';

const mockUpdate = vi.fn();
const mockMutate = vi.fn();
let mockActions: RiskTreatmentAction[] = [];
let mockError: Error | null = null;

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-risk-workspace', () => ({
  useRiskTreatmentActions: () => ({
    actions: mockActions,
    error: mockError,
    isLoading: false,
    mutate: mockMutate,
  }),
}));
vi.mock('@/hooks/use-task-items', () => ({
  useTaskItemActions: () => ({ createTaskItem: vi.fn(), updateTaskItem: mockUpdate }),
}));
vi.mock('./RiskActionSheet', () => ({ RiskActionSheet: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: RiskTreatmentAction = {
  id: 'tski_1',
  title: 'Enable MFA on the payment console',
  description: 'Admin console only',
  status: 'todo',
  priority: 'medium',
  dueDate: '2026-01-10T00:00:00.000Z',
  completedAt: null,
  entityId: 'rsk_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  isOverdue: true,
  risk: { id: 'rsk_1', title: 'Account takeover', status: 'open' },
  assignee: { id: 'mem_1', user: { id: 'usr_1', name: 'Jane Doe', email: 'j@x.com', image: null } },
};

const renderTracker = () =>
  render(<RiskActionTracker orgId="org_1" members={[{ id: 'mem_1', user: { name: 'Jane Doe', email: 'j@x.com' } }]} />);

describe('RiskActionTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockError = null;
    mockActions = [base, { ...base, id: 'tski_2', title: 'Rotate keys', status: 'done', isOverdue: false }];
  });

  it('lists open actions with risk link, owner and overdue flag', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderTracker();
    expect(screen.getByText('Enable MFA on the payment console')).toBeInTheDocument();
    expect(screen.queryByText('Rotate keys')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account takeover' })).toHaveAttribute('href', '/org_1/risk/rsk_1');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows completed actions under the Completed filter', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: /Completed · 1/ }));
    expect(screen.getByText('Rotate keys')).toBeInTheDocument();
  });

  it('lets task editors complete an action', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockUpdate.mockResolvedValue({});
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('tski_1', { status: 'done' }));
    expect(mockMutate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add action' })).toBeInTheDocument();
  });

  it('is read-only without task write permissions', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    renderTracker();
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add action' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('guides the user when there are no actions', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockActions = [];
    renderTracker();
    expect(screen.getByText('No treatment actions yet')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockError = new Error('boom');
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockMutate).toHaveBeenCalled();
  });
});
