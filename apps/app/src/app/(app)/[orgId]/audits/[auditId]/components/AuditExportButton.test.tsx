import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const startExport = vi.fn();
vi.mock('@/hooks/use-evidence-export', () => ({
  useEvidenceExport: () => ({ startExport, isExporting: false }),
}));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock('@trycompai/design-system/icons', () => ({ Download: () => null }));
const dialog = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('@/components/evidence-export/ExportEvidenceDialog', () => ({
  ExportEvidenceDialog: (props: {
    open: boolean;
    defaultValues: Record<string, string>;
    onExport: (values: Record<string, string>) => void;
  }) => {
    dialog.props = props;
    return props.open ? (
      <button onClick={() => props.onExport({ ...props.defaultValues, frameworkName: 'PCI DSS' })}>
        Export ZIP
      </button>
    ) : null;
  },
}));

import type { Audit } from '@/hooks/use-audits';
import { AuditExportButton } from './AuditExportButton';

const audit = {
  id: 'aud_1',
  frameworkInstanceId: 'frm_1',
  frameworkName: 'PCI DSS',
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-12-31T00:00:00.000Z',
} as Audit;

describe('AuditExportButton', () => {
  it('opens the shared export dialog preset to the audit and exports with its audit id', () => {
    render(<AuditExportButton audit={audit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export evidence' }));
    expect(dialog.props?.defaultValues).toEqual({
      frameworkInstanceId: 'frm_1',
      from: '2026-01-01',
      to: '2026-12-31',
      auditId: 'aud_1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));

    expect(startExport).toHaveBeenCalledWith(
      expect.objectContaining({ frameworkInstanceId: 'frm_1', auditId: 'aud_1', from: '2026-01-01' }),
    );
  });
});
