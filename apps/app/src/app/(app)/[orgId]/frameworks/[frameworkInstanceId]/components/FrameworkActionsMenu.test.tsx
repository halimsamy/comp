import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  NO_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrigger = vi.fn();
const mockDownload = vi.fn();
const mockToast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn() }));

type RunResult = { status: string; output?: { downloadUrl?: string } | null };
const jobRun: { runId?: string | null; onComplete?: (run: RunResult) => void } = {};
vi.mock('@/hooks/use-job-run', () => ({
  useJobRun: (runId: string | null, options: { onComplete?: (run: RunResult) => void }) => {
    jobRun.runId = runId;
    jobRun.onComplete = options.onComplete;
    return { run: undefined, error: undefined, isLoading: false };
  },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/lib/evidence-download', () => ({
  triggerFrameworkEvidenceExport: (...args: unknown[]) => mockTrigger(...args),
  startFileDownload: (...args: unknown[]) => mockDownload(...args),
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

  async function startExport() {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockTrigger.mockResolvedValue({ runId: 'jrun_1' });
    renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export all evidences' }));
    await waitFor(() => expect(jobRun.runId).toBe('jrun_1'));
  }

  it('starts the export job and downloads the ZIP once the run completes', async () => {
    await startExport();

    expect(mockTrigger).toHaveBeenCalledWith({ frameworkInstanceId: 'frm_1' });
    expect(mockToast.loading).toHaveBeenCalledWith(
      expect.stringContaining('PCI DSS Level 1'),
      expect.anything(),
    );
    expect(mockDownload).not.toHaveBeenCalled();
    expect(menuItems()).toContain('Preparing export…');

    act(() => jobRun.onComplete?.({ status: 'COMPLETED', output: { downloadUrl: 'https://s3/x.zip' } }));

    expect(mockDownload).toHaveBeenCalledWith('https://s3/x.zip');
    expect(mockToast.success).toHaveBeenCalled();
    expect(menuItems()).toContain('Export all evidences');
  });

  it('reports a failed run instead of downloading', async () => {
    await startExport();

    act(() => jobRun.onComplete?.({ status: 'FAILED', output: null }));

    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('reports an export that could not be started', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockTrigger.mockRejectedValue(new Error('boom'));
    renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export all evidences' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(jobRun.runId).toBeNull();
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
