import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddDeviceDialog } from './AddDeviceDialog';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ api: { post } }));
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
});
