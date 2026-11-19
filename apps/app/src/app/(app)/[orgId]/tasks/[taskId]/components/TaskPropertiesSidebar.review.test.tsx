import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PERMISSIONS, mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: vi.fn(() => ({ orgId: 'org_1', taskId: 'tsk_1' })),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => ({ members: [] }),
}));
vi.mock('@/components/SelectAssignee', () => ({ SelectAssignee: () => null }));
vi.mock('@/components/DepartmentSelect', () => ({ DepartmentSelect: () => null }));

let mockTask: Record<string, unknown> = {};
vi.mock('../hooks/use-task', () => ({
  useTask: () => ({ task: mockTask, isLoading: false }),
}));

import { TaskPropertiesSidebar } from './TaskPropertiesSidebar';

const baseTask = {
  id: 'tsk_1',
  status: 'in_review',
  approverId: null,
  assigneeId: null,
  frequency: 'semiannually',
  department: null,
  reviewDate: '2027-05-18T12:00:00.000Z',
  lastCompletedAt: '2026-11-18T12:00:00.000Z',
};

const statusTrigger = () => screen.getAllByRole('combobox')[0];

describe('TaskPropertiesSidebar — review lock and due dates', () => {
  beforeEach(() => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockTask = { ...baseTask };
  });

  it('lets a person change the status of an automation-set review (no approver)', () => {
    render(<TaskPropertiesSidebar handleUpdateTask={vi.fn()} evidenceApprovalEnabled />);
    expect(statusTrigger()).not.toBeDisabled();
  });

  it('locks status while an approver is reviewing', () => {
    mockTask = { ...baseTask, approverId: 'mem_appr' };
    render(<TaskPropertiesSidebar handleUpdateTask={vi.fn()} evidenceApprovalEnabled />);
    expect(statusTrigger()).toBeDisabled();
  });

  it('shows the next due date and the last completion date', () => {
    render(<TaskPropertiesSidebar handleUpdateTask={vi.fn()} />);
    expect(screen.getByLabelText('Due')).toHaveValue('5/18/2027');
    expect(screen.getByLabelText('Last Completed')).toHaveValue('11/18/2026');
  });
});
