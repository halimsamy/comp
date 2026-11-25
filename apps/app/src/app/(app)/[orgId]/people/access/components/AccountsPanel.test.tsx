import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsPanel } from './AccountsPanel';

const { hasPermission, useAccessSystems } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  useAccessSystems: vi.fn(),
}));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-access-reviews', () => ({
  useAccessSystems,
  useAccessAccounts: () => ({
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    accounts: [
      {
        accountId: 'acme/octocat',
        name: 'octocat',
        email: null,
        type: 'human',
        status: 'active',
        roles: ['owner'],
        isAdmin: true,
        mfaEnabled: false,
        lastLoginAt: null,
        accountCreatedAt: null,
        owner: null,
        ownerSource: null,
        isServiceAccount: false,
        justification: null,
        flags: ['unmapped', 'admin', 'no_mfa'],
      },
      {
        accountId: 'jane@acme.com',
        name: 'Jane',
        email: 'jane@acme.com',
        type: 'human',
        status: 'active',
        roles: ['member'],
        isAdmin: false,
        mfaEnabled: true,
        lastLoginAt: null,
        accountCreatedAt: null,
        owner: { memberId: 'mem_1', name: 'Jane', email: 'jane@acme.com', departed: false },
        ownerSource: 'email',
        isServiceAccount: false,
        justification: null,
        flags: [],
      },
    ],
  }),
  useAccessMutations: () => ({}),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const system = (kind: string, key: string) => ({
  key,
  name: kind === 'manual' ? 'Bank portal' : 'GitHub',
  kind,
  logoUrl: null,
  description: null,
  lastSyncAt: null,
  accountCount: 2,
  flaggedCount: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  useAccessSystems.mockReturnValue({ systems: [system('integration', 'connection:icn_1')], isLoading: false, mutate: vi.fn() });
});

describe('AccountsPanel', () => {
  it('filters to flagged accounts and offers owner mapping to admins', () => {
    hasPermission.mockReturnValue(true);
    render(<AccountsPanel members={[]} />);
    expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Flagged · 1/ }));
    expect(screen.queryByText('jane@acme.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add system/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('adds and removes single accounts and imports CSVs only on manual systems', async () => {
    hasPermission.mockReturnValue(true);
    useAccessSystems.mockReturnValue({ systems: [system('manual', 'manual:asy_1')], isLoading: false, mutate: vi.fn() });
    render(<AccountsPanel members={[]} />);
    expect(screen.getByRole('button', { name: /Add account/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jane' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByText('Import accounts (CSV)')).toBeInTheDocument();
    expect(screen.getByText('Delete system')).toBeInTheDocument();
  });

  it('is read-only without member:update', () => {
    hasPermission.mockReturnValue(false);
    render(<AccountsPanel members={[]} />);
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add system/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeEnabled();
  });
});
