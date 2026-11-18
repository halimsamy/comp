import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSETS } from '../lib/assets.fixtures';
import { AssetsClient } from './AssetsClient';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const state = {
  assets: ASSETS,
  isLoading: false,
  error: undefined as Error | undefined,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
};
vi.mock('@/hooks/use-assets', () => ({ useAssets: () => state }));
vi.mock('@/lib/evidence-download', () => ({ downloadRegisterCsv: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const members = [{ id: 'mem_1', name: 'Ada' }];

beforeEach(() => {
  state.assets = ASSETS;
  state.isLoading = false;
  state.error = undefined;
  setMockPermissions({ integration: ['read', 'create', 'update', 'delete'] });
});

describe('AssetsClient', () => {
  it('lists assets with scope, owner and vulnerability counts', () => {
    render(<AssetsClient memberOptions={members} />);
    const row = screen.getByText('payments-prod-db').closest('tr') as HTMLElement;
    expect(within(row).getByText('In CDE')).toBeInTheDocument();
    expect(within(row).getByText('Ada')).toBeInTheDocument();
    expect(within(row).getByText('2 open')).toBeInTheDocument();
    const repo = screen.getByText('acme/web', { selector: 'p' }).closest('tr') as HTMLElement;
    expect(within(repo).getByText('No owner')).toBeInTheDocument();
    expect(screen.getByText('Without an owner')).toBeInTheDocument();
  });

  it('narrows the table by category', () => {
    render(<AssetsClient memberOptions={members} />);
    const nav = screen.getByRole('navigation', { name: 'Asset types' });
    fireEvent.click(within(nav).getByText('Code repositories'));
    expect(screen.queryByText('payments-prod-db')).not.toBeInTheDocument();
    expect(screen.getByText('acme/web', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows refresh, export and add for admins', () => {
    render(<AssetsClient memberOptions={members} />);
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add asset/ })).toBeInTheDocument();
  });

  it('hides mutations for read-only users', () => {
    setMockPermissions({ integration: ['read'] });
    render(<AssetsClient memberOptions={members} />);
    expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add asset/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });

  it('guides the user when the inventory is empty', () => {
    state.assets = [];
    render(<AssetsClient memberOptions={members} />);
    expect(screen.getByText('No assets yet')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    state.assets = [];
    state.error = new Error('boom');
    render(<AssetsClient memberOptions={members} />);
    expect(screen.getByText(/Could not load the asset inventory/)).toBeInTheDocument();
  });
});
