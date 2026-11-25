import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DevicesTabContent } from './DevicesTabContent';

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('../hooks/useAgentDevices', () => ({
  useAgentDevices: () => ({ agentDevices: [], isLoading: false, error: undefined, mutate: vi.fn() }),
}));
vi.mock('../hooks/useFleetHosts', () => ({
  useFleetHosts: () => ({ fleetHosts: [], isLoading: false, error: undefined }),
}));
vi.mock('./DeviceSyncProviderSelector', () => ({ DeviceSyncProviderSelector: () => null }));
vi.mock('./DeviceComplianceChart', () => ({ DeviceComplianceChart: () => null }));
vi.mock('./AddDeviceDialog', () => ({ AddDeviceDialog: () => null }));

describe('DevicesTabContent', () => {
  it('shows Add device to members who can update people', () => {
    hasPermission.mockImplementation((resource: string, action: string) => resource === 'member' && action === 'update');
    render(<DevicesTabContent isCurrentUserOwner={false} />);
    expect(screen.getByRole('button', { name: 'Add device' })).toBeInTheDocument();
  });

  it('hides Add device from read-only users', () => {
    hasPermission.mockReturnValue(false);
    render(<DevicesTabContent isCurrentUserOwner={false} />);
    expect(screen.queryByRole('button', { name: 'Add device' })).not.toBeInTheDocument();
  });
});
