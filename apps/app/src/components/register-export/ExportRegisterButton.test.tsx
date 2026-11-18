import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  NO_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownload = vi.fn();
const mockToast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/lib/evidence-download', () => ({
  downloadRegisterCsv: (...args: unknown[]) => mockDownload(...args),
}));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <div role="menuitem" onClick={onClick}>
      {children}
    </div>
  ),
}));
vi.mock('@trycompai/design-system/icons', () => ({ Download: () => null }));

import { ExportRegisterButton } from './ExportRegisterButton';

const RISK_OPTIONS = [
  { register: 'risks' as const, label: 'Risk register' },
  { register: 'risk-acceptances' as const, label: 'Risk acceptances' },
];

describe('ExportRegisterButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('downloads a single register straight from the button', async () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    mockDownload.mockResolvedValue(undefined);
    render(<ExportRegisterButton options={[{ register: 'vendors', label: 'Vendor register' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('vendors'));
    expect(mockHasPermission).toHaveBeenCalledWith('vendor', 'read');
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('offers a menu when several registers are readable', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockDownload.mockResolvedValue(undefined);
    render(<ExportRegisterButton options={RISK_OPTIONS} />);

    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Risk register',
      'Risk acceptances',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Risk acceptances' }));

    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('risk-acceptances'));
  });

  it('reports a failed download', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockDownload.mockRejectedValue(new Error('403'));
    render(<ExportRegisterButton options={[{ register: 'people', label: 'People' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it('is hidden without read access', () => {
    setMockPermissions(NO_PERMISSIONS);
    const { container } = render(<ExportRegisterButton options={RISK_OPTIONS} />);

    expect(container).toBeEmptyDOMElement();
  });
});
