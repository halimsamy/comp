import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddDeviceDialog } from './AddDeviceDialog';

const { post, put } = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ api: { post, put } }));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => ({
    members: [
      { id: 'mem_1', deactivated: false, user: { name: 'Jane Doe', email: 'jane@acme.com' } },
      { id: 'mem_2', deactivated: true, user: { name: 'Gone', email: 'gone@acme.com' } },
    ],
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('AddDeviceDialog', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { id: 'dev_1' } });
  });

  it('requires a person, a name and an OS version', async () => {
    render(<AddDeviceDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
    expect(await screen.findByText('Choose who uses the device')).toBeInTheDocument();
    expect(screen.getByText('Name the device')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('posts the device with its attested checks and refreshes the list', async () => {
    const onAdded = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<AddDeviceDialog open onOpenChange={onOpenChange} onAdded={onAdded} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Used by' }));
    expect(screen.queryByRole('option', { name: 'Gone' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('option', { name: 'Jane Doe' }));
    fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'Jane Mac' } });
    fireEvent.change(screen.getByLabelText('OS version'), { target: { value: '15.1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Disk Encryption' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/v1/devices', {
      memberId: 'mem_1',
      name: 'Jane Mac',
      platform: 'macos',
      osVersion: '15.1',
      diskEncryptionEnabled: true,
      antivirusEnabled: false,
      passwordPolicySet: false,
      screenLockEnabled: false,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edits a manual device: pre-fills it and saves with PUT', async () => {
    put.mockResolvedValue({ data: { id: 'dev_lap1' } });
    const onAdded = vi.fn().mockResolvedValue(undefined);
    const device = {
      id: 'dev_lap1',
      name: 'LAP-001',
      hostname: 'LAP-001',
      platform: 'macos' as const,
      osVersion: 'Not recorded',
      serialNumber: null,
      hardwareModel: null,
      isCompliant: true,
      diskEncryptionEnabled: true,
      antivirusEnabled: true,
      passwordPolicySet: true,
      screenLockEnabled: true,
      checkDetails: null,
      lastCheckIn: null,
      agentVersion: null,
      installedAt: '2026-11-25',
      memberId: 'mem_1',
      user: { name: 'Jane Doe', email: 'jane@acme.com' },
      source: 'manual' as const,
      complianceStatus: 'compliant' as const,
      daysSinceLastCheckIn: 0,
      hasActiveAgentSession: false,
    };
    render(<AddDeviceDialog open device={device} onOpenChange={vi.fn()} onAdded={onAdded} />);

    expect(screen.getByText('Edit LAP-001')).toBeInTheDocument();
    expect(screen.getByLabelText('Device name')).toHaveValue('LAP-001');
    fireEvent.change(screen.getByLabelText('OS version'), { target: { value: '15.1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Antivirus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith('/v1/devices/dev_lap1', expect.objectContaining({
      memberId: 'mem_1',
      name: 'LAP-001',
      osVersion: '15.1',
      antivirusEnabled: false,
      diskEncryptionEnabled: true,
    }));
  });
});
