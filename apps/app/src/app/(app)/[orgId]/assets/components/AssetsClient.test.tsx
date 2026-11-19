import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSETS } from '../lib/assets.fixtures';
import { AssetsClient } from './AssetsClient';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const state = {
  assets: ASSETS,
  review: { lastReviewedAt: null as string | null, reviewedBy: null },
  formImport: null as { rows: number; submittedAt: string; imported: number } | null,
  isLoading: false,
  error: undefined as Error | undefined,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
  importFromForm: vi.fn(),
  importCsv: vi.fn(),
  markReviewed: vi.fn(),
};
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/use-assets', () => ({ useAssets: () => state }));
vi.mock('@/lib/evidence-download', () => ({ downloadRegisterCsv: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const members = [{ id: 'mem_1', name: 'Ada' }];

beforeEach(() => {
  state.assets = ASSETS;
  state.formImport = null;
  state.review = { lastReviewedAt: null, reviewedBy: null };
  vi.clearAllMocks();
  state.isLoading = false;
  state.error = undefined;
  setMockPermissions({ integration: ['read', 'create', 'update', 'delete'] });
});

describe('AssetsClient', () => {
  it('lists assets with scope, owner and vulnerability counts', () => {
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    const row = screen.getByText('payments-prod-db').closest('tr') as HTMLElement;
    expect(within(row).getByText('In CDE')).toBeInTheDocument();
    expect(within(row).getByText('Ada')).toBeInTheDocument();
    expect(within(row).getByText('2 open')).toBeInTheDocument();
    const repo = screen.getByText('acme/web', { selector: 'p' }).closest('tr') as HTMLElement;
    expect(within(repo).getByText('No owner')).toBeInTheDocument();
    expect(screen.getByText('Without an owner')).toBeInTheDocument();
  });

  it('narrows the table by category', () => {
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    const nav = screen.getByRole('navigation', { name: 'Asset types' });
    fireEvent.click(within(nav).getByText('Code repositories'));
    expect(screen.queryByText('payments-prod-db')).not.toBeInTheDocument();
    expect(screen.getByText('acme/web', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows refresh, export and add for admins', () => {
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add asset/ })).toBeInTheDocument();
  });

  it('hides mutations for read-only users', () => {
    setMockPermissions({ integration: ['read'] });
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add asset/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });

  it('guides the user when the inventory is empty', () => {
    state.assets = [];
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.getByText('No assets yet')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    state.assets = [];
    state.error = new Error('boom');
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.getByText(/Could not load the asset inventory/)).toBeInTheDocument();
  });

  it('offers to import the Infrastructure Inventory form into an empty inventory', async () => {
    state.assets = [];
    state.formImport = { rows: 33, submittedAt: '2026-11-11', imported: 0 };
    state.importFromForm.mockResolvedValue({ created: 33, updated: 0, total: 33 });
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Import 33 rows from Infrastructure Inventory' }),
    );
    await waitFor(() => expect(state.importFromForm).toHaveBeenCalledTimes(1));
  });

  it('hides the form import from read-only users', () => {
    setMockPermissions({ integration: ['read'] });
    state.assets = [];
    state.formImport = { rows: 33, submittedAt: '2026-11-11', imported: 0 };
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.queryByRole('button', { name: /Import 33 rows/ })).not.toBeInTheDocument();
  });

  it('puts imports and the inventory review in the actions menu for admins', async () => {
    state.formImport = { rows: 33, submittedAt: '2026-11-11', imported: 33 };
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    expect(await screen.findByText('Mark inventory reviewed')).toBeInTheDocument();
    expect(screen.getByText('Import CSV')).toBeInTheDocument();
    expect(screen.getByText('Import 33 rows from Infrastructure Inventory')).toBeInTheDocument();
  });

  it('says when the inventory was last reviewed', () => {
    state.review = {
      lastReviewedAt: '2026-11-11T10:00:00.000Z',
      reviewedBy: null,
    };
    render(<AssetsClient memberOptions={members} vendorOptions={[]} />);
    expect(screen.getByText(/Last reviewed Nov 11, 2026/)).toBeInTheDocument();
  });
});
