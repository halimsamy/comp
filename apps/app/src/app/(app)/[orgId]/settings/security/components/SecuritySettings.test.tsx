import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecuritySettings } from './SecuritySettings';

const { hasPermission, update, state } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  update: vi.fn(),
  state: { settings: null as unknown, error: undefined as Error | undefined, isLoading: false },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1' }) }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-security-settings', () => ({
  useSecuritySettings: () => ({ ...state, update }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseSettings = {
  sessionIdleTimeoutMinutes: 15,
  allowedSignInMethods: [] as string[],
  idleTimeoutOptions: [15, 30, 60],
  availableSignInMethods: [
    { id: 'google', label: 'Google' },
    { id: 'magic-link', label: 'magic link' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  state.settings = { ...baseSettings };
  state.error = undefined;
  state.isLoading = false;
});

describe('SecuritySettings', () => {
  it('shows PCI DSS 8.2.8 compliance for a 15 minute timeout', () => {
    hasPermission.mockReturnValue(true);
    render(<SecuritySettings />);
    expect(screen.getByText('Meets PCI DSS 8.2.8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'event log' })).toHaveAttribute(
      'href',
      '/org_1/settings/event-log',
    );
  });

  it('warns when the idle timeout is off', () => {
    hasPermission.mockReturnValue(true);
    state.settings = { ...baseSettings, sessionIdleTimeoutMinutes: null };
    render(<SecuritySettings />);
    expect(screen.getByText(/requires re-authentication after 15 minutes/)).toBeInTheDocument();
  });

  it('lets admins restrict sign-in methods, starting from every method', async () => {
    hasPermission.mockReturnValue(true);
    render(<SecuritySettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Restrict sign-in methods' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ allowedSignInMethods: ['google', 'magic-link'] }),
    );
    expect(hasPermission).toHaveBeenCalledWith('organization', 'update');
  });

  it('is read-only without organization:update', () => {
    hasPermission.mockReturnValue(false);
    render(<SecuritySettings />);
    expect(screen.getByRole('switch', { name: 'Restrict sign-in methods' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows an error state', () => {
    hasPermission.mockReturnValue(true);
    state.settings = null;
    state.error = new Error('nope');
    render(<SecuritySettings />);
    expect(screen.getByText(/couldn.t be loaded/)).toBeInTheDocument();
  });
});
