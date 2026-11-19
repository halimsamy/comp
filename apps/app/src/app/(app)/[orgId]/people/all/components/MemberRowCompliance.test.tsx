import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemberCompliance } from '../lib/people-compliance';
import type { MemberWithUser } from './TeamMembers';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_123' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./MultiRoleCombobox', () => ({ MultiRoleCombobox: () => null }));
vi.mock('./RemoveDeviceAlert', () => ({ RemoveDeviceAlert: () => null }));
vi.mock('./RemoveMemberAlert', () => ({ RemoveMemberAlert: () => null }));

import { MemberRow } from './MemberRow';

const member = {
  id: 'mem_1',
  role: 'employee',
  isActive: true,
  deactivated: false,
  user: { id: 'usr_1', name: 'Jane Doe', email: 'jane@example.com', role: 'user' },
} as unknown as MemberWithUser;

const compliance = (overrides: Partial<MemberCompliance['member']> = {}): MemberCompliance => ({
  member: { id: 'mem_1', name: 'Jane', email: 'jane@example.com', department: 'it', offboardDate: null, deactivated: false, former: false, ...overrides },
  items: [],
  overall: 'overdue',
  completedItems: 1,
  totalItems: 4,
});

const renderRow = ({ canEdit, entry, onSendReminder }: { canEdit: boolean; entry: MemberCompliance; onSendReminder?: (id: string) => Promise<void> }) =>
  render(
    <table>
      <tbody>
        <MemberRow
          member={member}
          onRemove={vi.fn()}
          onRemoveDevice={vi.fn()}
          onUpdateRole={vi.fn()}
          onReactivate={vi.fn()}
          canEdit={canEdit}
          isCurrentUserOwner={false}
          requirementColumns={['compliance']}
          compliance={entry}
          onSendReminder={onSendReminder}
        />
      </tbody>
    </table>,
  );

describe('MemberRow compliance (#86, #162)', () => {
  it('shows the overall compliance status and the Former badge', () => {
    renderRow({ canEdit: false, entry: compliance({ former: true }) });
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Former')).toBeInTheDocument();
  });

  it('lets members:update send a reminder', () => {
    const onSendReminder = vi.fn().mockResolvedValue(undefined);
    renderRow({ canEdit: true, entry: compliance(), onSendReminder });
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Send reminder'));
    expect(onSendReminder).toHaveBeenCalledWith('mem_1');
  });

  it('has a disabled actions menu without member:update', () => {
    renderRow({ canEdit: false, entry: compliance(), onSendReminder: vi.fn() });
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByText('Send reminder')).not.toBeInTheDocument();
  });
});
