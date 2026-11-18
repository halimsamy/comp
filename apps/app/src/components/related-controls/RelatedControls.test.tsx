import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelatedControls } from './RelatedControls';
import { requirementChips, shortFrameworkName } from './RequirementCodes';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-controls-overview', () => ({
  useControlsOverview: () => ({ controls: [], isLoading: false }),
}));

const state = {
  controls: [] as unknown[],
  isLoading: false,
  error: undefined as Error | undefined,
  link: vi.fn(),
  unlink: vi.fn(),
};
const useRelatedControls = vi.fn((_args: unknown) => state);
vi.mock('./use-related-controls', () => ({
  useRelatedControls: (args: unknown) => useRelatedControls(args),
}));

const accessRights = {
  id: 'ctl_1',
  name: 'Access Rights',
  description: '',
  owner: { id: 'mem_1', name: 'Ada', email: 'ada@x.io', image: null, deactivated: true },
  frameworks: [
    {
      frameworkInstanceId: 'fi_iso',
      frameworkName: 'ISO 27001',
      requirements: [{ identifier: 'A.5.15', name: 'Access control' }],
    },
    {
      frameworkInstanceId: 'fi_pci',
      frameworkName: 'PCI DSS Level 1',
      requirements: [{ identifier: '7.2.1', name: 'Access control model' }],
    },
  ],
};

beforeEach(() => {
  state.controls = [];
  state.isLoading = false;
  state.error = undefined;
  useRelatedControls.mockClear();
});

describe('RelatedControls', () => {
  it('shows ISO and PCI codes, owner and links to the control', () => {
    setMockPermissions({ control: ['read', 'update'] });
    state.controls = [accessRights];

    render(<RelatedControls entityType="policy" entityId="pol_1" />);

    expect(useRelatedControls).toHaveBeenCalledWith({
      entityType: 'policy',
      entityId: 'pol_1',
      enabled: true,
    });
    expect(screen.getByRole('link', { name: 'Access Rights' })).toHaveAttribute(
      'href',
      '/org_1/controls/ctl_1',
    );
    expect(screen.getByText('ISO 27001 · A.5.15')).toBeInTheDocument();
    expect(screen.getByText('PCI DSS · 7.2.1')).toBeInTheDocument();
    expect(screen.getByText('Ada (left)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink Access Rights' })).toBeInTheDocument();
    expect(screen.getByText('Link control')).toBeInTheDocument();
  });

  it('is read-only without control:update', () => {
    setMockPermissions({ control: ['read'] });
    state.controls = [accessRights];

    render(<RelatedControls entityType="task" entityId="tsk_1" />);

    expect(screen.queryByText('Link control')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink Access Rights' })).not.toBeInTheDocument();
  });

  it('is read-only when the caller locks it (policy pending approval)', () => {
    setMockPermissions({ control: ['read', 'update'] });
    render(<RelatedControls entityType="policy" entityId="pol_1" readOnly />);
    expect(screen.queryByText('Link control')).not.toBeInTheDocument();
    expect(screen.getByText('This policy is not linked to any control yet.')).toBeInTheDocument();
  });

  it('guides editors when nothing is linked', () => {
    setMockPermissions({ control: ['read', 'update'] });
    render(<RelatedControls entityType="evidence_form" entityId="access-request" />);
    expect(screen.getByText('No controls linked')).toBeInTheDocument();
    expect(screen.getByText(/counts toward every framework/)).toBeInTheDocument();
  });

  it('renders nothing without control:read', () => {
    setMockPermissions({});
    const { container } = render(<RelatedControls entityType="task" entityId="tsk_1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an error message when loading fails', () => {
    setMockPermissions({ control: ['read'] });
    state.error = new Error('boom');
    render(<RelatedControls entityType="isms_document" entityId="doc_1" />);
    expect(screen.getByText(/Could not load related controls/)).toBeInTheDocument();
  });
});

describe('requirement chips', () => {
  it('drops the PCI level and keeps the code', () => {
    expect(shortFrameworkName('PCI DSS Level 1')).toBe('PCI DSS');
    expect(requirementChips(accessRights.frameworks).map((c) => c.label)).toEqual([
      'ISO 27001 · A.5.15',
      'PCI DSS · 7.2.1',
    ]);
  });
});
