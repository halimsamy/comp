import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PERMISSIONS, mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-evidence-export', () => ({
  useEvidenceExport: () => ({ startExport: vi.fn(), isExporting: false }),
}));
vi.mock('@/components/evidence-export/ExportEvidenceDialog', () => ({
  ExportEvidenceDialog: ({ frameworks }: { frameworks: Array<{ name: string }> }) => (
    <div data-testid="dialog">{frameworks.map((f) => f.name).join(',')}</div>
  ),
}));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock('@trycompai/design-system/icons', () => ({ Download: () => null }));

import { EvidenceExportButton } from './EvidenceExportButton';

const frameworkInstances = [
  { id: 'fi_1', framework: { id: 'f1', name: 'ISO 27001' }, customFramework: null, requirementsMapped: [] },
  { id: 'fi_2', framework: null, customFramework: { id: 'c1', name: 'PCI DSS' }, requirementsMapped: [] },
];

describe('EvidenceExportButton', () => {
  beforeEach(() => setMockPermissions(ADMIN_PERMISSIONS));

  it('offers every framework of the org in the shared export dialog', () => {
    render(<EvidenceExportButton frameworkInstances={frameworkInstances} />);
    expect(screen.getByText('Export evidence')).toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('ISO 27001,PCI DSS');
  });

  it('needs evidence:read and policy:read', () => {
    setMockPermissions({ evidence: ['read'] });
    render(<EvidenceExportButton frameworkInstances={frameworkInstances} />);
    expect(screen.queryByText('Export evidence')).not.toBeInTheDocument();
  });

  it('renders nothing without frameworks', () => {
    render(<EvidenceExportButton frameworkInstances={[]} />);
    expect(screen.queryByText('Export evidence')).not.toBeInTheDocument();
  });
});
