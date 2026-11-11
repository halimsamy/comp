import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  NO_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownload = vi.fn();
const mockToast = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/lib/evidence-download', () => ({
  startFrameworkEvidenceDownload: (...args: unknown[]) => mockDownload(...args),
}));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));
vi.mock('@trycompai/design-system/icons', () => ({
  Download: () => null,
  Edit: () => null,
  OverflowMenuVertical: () => null,
  TrashCan: () => null,
}));
vi.mock('@trycompai/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <div role="menuitem" onClick={onClick}>
      {children}
    </div>
  ),
}));

import { FrameworkActionsMenu } from './FrameworkActionsMenu';

function renderMenu() {
  return render(
    <FrameworkActionsMenu
      frameworkInstanceId="frm_1"
      frameworkName="PCI DSS Level 1"
      canEdit={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

const menuItems = () => screen.queryAllByRole('menuitem').map((item) => item.textContent);

describe('FrameworkActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Export all evidences above Delete Framework for admins', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderMenu();

    expect(menuItems()).toEqual(['Export all evidences', 'Delete Framework']);
  });

  it('starts the framework evidence ZIP download', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export all evidences' }));

    expect(mockDownload).toHaveBeenCalledWith({ frameworkInstanceId: 'frm_1' });
    expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('PCI DSS Level 1'));
  });

  it('lets auditors export but not delete', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    renderMenu();

    expect(menuItems()).toEqual(['Export all evidences']);
  });

  it('renders nothing without permissions', () => {
    setMockPermissions(NO_PERMISSIONS);
    const { container } = renderMenu();

    expect(container).toBeEmptyDOMElement();
  });
});
