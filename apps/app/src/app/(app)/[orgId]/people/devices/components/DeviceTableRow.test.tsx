import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Table, TableBody } from '@trycompai/design-system';
import type { DeviceWithChecks } from '../types';
import { DeviceTableRow } from './DeviceTableRow';

const device = (source: DeviceWithChecks['source']): DeviceWithChecks => ({
  id: `dev_${source}`,
  name: `Laptop ${source}`,
  hostname: 'host',
  platform: 'macos',
  osVersion: '15.1',
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
  user: { name: 'Jane', email: 'jane@acme.com' },
  source,
  complianceStatus: 'compliant' as const,
  daysSinceLastCheckIn: 0,
  hasActiveAgentSession: false,
});

const renderRow = (d: DeviceWithChecks, onRequestEdit = vi.fn()) => {
  render(
    <Table>
      <TableBody>
        <DeviceTableRow
          device={d}
          orgId="org_1"
          canRemoveDevice
          onSelect={vi.fn()}
          onRequestRemove={vi.fn()}
          onRequestEdit={onRequestEdit}
        />
      </TableBody>
    </Table>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open device actions' }));
  return onRequestEdit;
};

describe('DeviceTableRow actions', () => {
  it('offers Edit on a manual device', async () => {
    const onRequestEdit = renderRow(device('manual'));
    fireEvent.click(await screen.findByText('Edit device'));
    expect(onRequestEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev_manual' }));
  });

  it('does not offer Edit on an agent device', async () => {
    renderRow(device('device_agent'));
    expect(await screen.findByText('Remove Device')).toBeInTheDocument();
    expect(screen.queryByText('Edit device')).not.toBeInTheDocument();
  });
});
