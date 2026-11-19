import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROLS } from '../lib/controls-overview.fixtures';
import { ControlsHeaderActions } from './ControlsHeaderActions';
import { ControlsOverview } from './ControlsOverview';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgId: 'org_1' }),
  useRouter: () => ({ push }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const bulkSetOwner = vi.fn().mockResolvedValue({ controls: 1, tasks: 2, policies: 0 });
const overviewState = {
  controls: CONTROLS,
  isLoading: false,
  error: undefined as Error | undefined,
  bulkSetOwner,
};
vi.mock('@/hooks/use-controls-overview', () => ({
  useControlsOverview: () => overviewState,
}));
const setCreateOpen = vi.fn();
vi.mock('nuqs', () => ({ useQueryState: () => [null, setCreateOpen] }));
vi.mock('./CreateControlSheet', () => ({ CreateControlSheet: () => <div data-testid="create-sheet" /> }));
const downloadControlCrosswalkCsv = vi.fn();
vi.mock('@/lib/evidence-download', () => ({
  downloadControlCrosswalkCsv: () => downloadControlCrosswalkCsv(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => ({
    members: [{ id: 'mem_ada', deactivated: false, user: { name: 'Ada', email: 'ada@x.io' } }],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-api-swr', () => ({ useApiSWR: () => ({ data: undefined, isLoading: false }) }));

beforeEach(() => {
  overviewState.controls = CONTROLS;
  overviewState.isLoading = false;
  overviewState.error = undefined;
  push.mockClear();
  setMockPermissions({ control: ['read'] });
});

describe('ControlsOverview', () => {
  it('shows each control with ISO and PCI codes, owner, evidence and status', () => {
    render(<ControlsOverview />);

    const row = screen.getByText('Access Rights').closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('ISO 27001 · A.5.15')).toBeInTheDocument();
    expect(cells.getByText('PCI DSS · 7.2.1')).toBeInTheDocument();
    expect(cells.getByText('Ada')).toBeInTheDocument();
    expect(cells.getByText('2/3')).toBeInTheDocument();
    expect(cells.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Bob (left)')).toBeInTheDocument();
    expect(screen.getByText('Needs reassignment')).toBeInTheDocument();
  });

  it('opens the control on row click', () => {
    render(<ControlsOverview />);
    fireEvent.click(screen.getByText('Access Rights'));
    expect(push).toHaveBeenCalledWith('/org_1/controls/ctl_access');
  });

  it('guides the user when there are no controls', () => {
    overviewState.controls = [];
    render(<ControlsOverview />);
    expect(screen.getByText('No controls yet')).toBeInTheDocument();
  });

  it('shows an error when loading fails', () => {
    overviewState.controls = [];
    overviewState.error = new Error('boom');
    render(<ControlsOverview />);
    expect(screen.getByText(/Could not load controls/)).toBeInTheDocument();
  });
});

describe('ControlsOverview bulk owners', () => {
  it('lets editors select rows and set one owner for all of them', async () => {
    setMockPermissions({ control: ['read', 'update'] });
    render(<ControlsOverview />);
    expect(screen.getByText('Suggest owners')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Access Rights' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected');
  });

  it('hides selection, bulk actions and suggestions from read-only users', () => {
    setMockPermissions({ control: ['read'] });
    render(<ControlsOverview />);
    expect(screen.queryByRole('checkbox', { name: 'Select Access Rights' })).not.toBeInTheDocument();
    expect(screen.queryByText('Suggest owners')).not.toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });
});

describe('ControlsHeaderActions', () => {
  const options = { policies: [], tasks: [], requirements: [] };

  it('lets admins create controls and export the crosswalk', () => {
    setMockPermissions({ control: ['read', 'create'] });
    render(<ControlsHeaderActions options={options} />);
    fireEvent.click(screen.getByText('Create control'));
    expect(setCreateOpen).toHaveBeenCalledWith('true');
    fireEvent.click(screen.getByText('Export crosswalk'));
    expect(downloadControlCrosswalkCsv).toHaveBeenCalled();
  });

  it('gives read-only users the export only', () => {
    setMockPermissions({ control: ['read'] });
    render(<ControlsHeaderActions options={options} />);
    expect(screen.getByText('Export crosswalk')).toBeInTheDocument();
    expect(screen.queryByText('Create control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-sheet')).not.toBeInTheDocument();
  });
});
