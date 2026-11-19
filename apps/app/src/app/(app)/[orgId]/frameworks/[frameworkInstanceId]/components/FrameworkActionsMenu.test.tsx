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

const exportState = vi.hoisted(() => ({ startExport: vi.fn(), isExporting: false }));
vi.mock('@/hooks/use-evidence-export', () => ({ useEvidenceExport: () => exportState }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
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

const dialogProps = vi.hoisted(() => ({ frameworks: [] as Array<{ id: string; name: string }> }));
vi.mock('@/components/evidence-export/ExportEvidenceDialog', () => ({
  ExportEvidenceDialog: ({
    open,
    frameworks,
    onExport,
  }: {
    open: boolean;
    frameworks: Array<{ id: string; name: string }>;
    onExport: (values: Record<string, string>) => void;
  }) => {
    dialogProps.frameworks = frameworks;
    return open ? (
      <button
        onClick={() =>
          onExport({
            frameworkInstanceId: 'frm_1',
            frameworkName: 'PCI DSS Level 1',
            from: '2026-01-01',
            to: '2026-06-30',
            auditId: '',
          })
        }
      >
        Export ZIP
      </button>
    ) : null;
  },
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
    exportState.isExporting = false;
  });

  it('shows Export evidence above Delete Framework for admins', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderMenu();

    expect(menuItems()).toEqual(['Export evidence', 'Delete Framework']);
  });

  it('opens the shared export dialog for this framework after the menu closes, then exports', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export evidence' }));
    expect(screen.queryByRole('button', { name: 'Export ZIP' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Export ZIP' }));

    expect(dialogProps.frameworks).toEqual([{ id: 'frm_1', name: 'PCI DSS Level 1' }]);
    expect(exportState.startExport).toHaveBeenCalledWith(
      expect.objectContaining({ frameworkInstanceId: 'frm_1', from: '2026-01-01', to: '2026-06-30' }),
    );
    expect(screen.queryByRole('button', { name: 'Export ZIP' })).toBeNull();
  });

  it('shows the running export instead of starting another', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    exportState.isExporting = true;
    renderMenu();

    expect(menuItems()).toContain('Preparing export…');
  });

  it('lets auditors export but not delete', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    renderMenu();

    expect(menuItems()).toEqual(['Export evidence']);
  });

  it('renders nothing without permissions', () => {
    setMockPermissions(NO_PERMISSIONS);
    const { container } = renderMenu();

    expect(container).toBeEmptyDOMElement();
  });
});
