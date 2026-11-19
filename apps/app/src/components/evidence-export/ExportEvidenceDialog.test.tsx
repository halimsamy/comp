import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format, subMonths } from 'date-fns';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const pass = vi.hoisted(() => ({ children }: { children?: unknown }) => children);
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, onClick, type }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) => (
    <button type={type ?? 'button'} onClick={onClick}>
      {children}
    </button>
  ),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: pass,
  DialogDescription: pass,
  DialogFooter: pass,
  DialogHeader: pass,
  DialogTitle: pass,
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
  Select: pass,
  SelectContent: pass,
  SelectItem: ({ children }: { children: ReactNode }) => <div role="option">{children}</div>,
  SelectTrigger: pass,
  SelectValue: () => null,
}));
vi.mock('@trycompai/design-system/icons', () => ({ Checkmark: () => null }));
vi.mock('./DateRangeField', () => ({
  DateRangeField: ({ from, to }: { from: string; to: string }) => (
    <output aria-label="Audit period">{from || to ? `${from}..${to}` : 'All time'}</output>
  ),
}));

import { ExportEvidenceDialog } from './ExportEvidenceDialog';

const audit = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `Audit ${id}`,
  status: 'in_progress',
  frameworkInstanceId: 'frm_1',
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

function renderDialog(props: Partial<Parameters<typeof ExportEvidenceDialog>[0]> = {}) {
  const onExport = vi.fn();
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ExportEvidenceDialog
        open
        onOpenChange={vi.fn()}
        frameworks={[{ id: 'frm_1', name: 'ISO 27001' }]}
        onExport={onExport}
        {...props}
      />
    </SWRConfig>,
  );
  return onExport;
}

describe('ExportEvidenceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockPermissions({ audit: ['read'], evidence: ['read'], policy: ['read'] });
    mockGet.mockResolvedValue({
      data: {
        data: [
          audit('aud_1'),
          audit('aud_done', { status: 'completed' }),
          audit('aud_pci', { frameworkInstanceId: 'frm_2' }),
        ],
      },
    });
  });

  it('defaults to all time and exports the whole history', async () => {
    const onExport = renderDialog();

    expect(screen.getByLabelText('Audit period').textContent).toBe('All time');
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    await waitFor(() =>
      expect(onExport).toHaveBeenCalledWith({
        frameworkInstanceId: 'frm_1',
        frameworkName: 'ISO 27001',
        from: '',
        to: '',
        auditId: '',
      }),
    );
  });

  it('offers last 12 months and each open audit of the framework as presets', async () => {
    const onExport = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Last 12 months' }));
    const today = new Date();
    expect(screen.getByLabelText('Audit period').textContent).toBe(
      `${format(subMonths(today, 12), 'yyyy-MM-dd')}..${format(today, 'yyyy-MM-dd')}`,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Audit aud_1' }));
    expect(screen.queryByRole('button', { name: 'Audit aud_done' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Audit aud_pci' })).toBeNull();
    expect(screen.getByText(/audit trail and evidence requests/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    await waitFor(() =>
      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-01-01', to: '2026-06-30', auditId: 'aud_1' }),
      ),
    );
  });

  it('does not load audits for someone who cannot read them', () => {
    setMockPermissions({ evidence: ['read'], policy: ['read'] });
    renderDialog();

    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Last 12 months' })).toBeTruthy();
  });

  it('asks for a framework only when there is a choice', () => {
    renderDialog({
      frameworks: [
        { id: 'frm_1', name: 'ISO 27001' },
        { id: 'frm_2', name: 'PCI DSS' },
      ],
    });

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ISO 27001', 'PCI DSS']);
  });

  it('rejects a period that ends before it starts', async () => {
    const onExport = renderDialog({ defaultValues: { from: '2026-06-01', to: '2026-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onExport).not.toHaveBeenCalled();
  });
});
