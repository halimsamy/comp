'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TableCell,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Edit, OverflowMenuVertical, TrashCan } from '@trycompai/design-system/icons';
import type { DeviceWithChecks } from '../types';
import { PLATFORM_LABELS, formatTimeAgo, isDeviceOnline } from '../lib/device-source';
import { CheckBadges, CompliantBadge, SourceBadge, UserNameCell } from './DeviceListCells';

export interface DeviceTableRowProps {
  device: DeviceWithChecks;
  orgId: string;
  canRemoveDevice: boolean;
  onSelect: (device: DeviceWithChecks) => void;
  onRequestRemove: (device: DeviceWithChecks) => void;
  /** Manual devices only: their details and checks are attested, so people edit them. */
  onRequestEdit?: (device: DeviceWithChecks) => void;
}

export function DeviceTableRow({
  device,
  orgId,
  canRemoveDevice,
  onSelect,
  onRequestRemove,
  onRequestEdit,
}: DeviceTableRowProps) {
  const isAgent = device.source === 'device_agent';
  // Imported devices carry the PROVIDER's last-contact timestamp in
  // lastCheckIn (see device sync lastSeenAt), so the same online rule applies
  // honestly to them too. Fleet rows keep the spacer.
  const showsLiveDot = isAgent || device.source === 'integration';
  const showOnline = showsLiveDot && isDeviceOnline(device.lastCheckIn);
  return (
    <TableRow onClick={() => onSelect(device)} style={{ cursor: 'pointer' }}>
      <TableCell>
        <div className="flex items-center gap-2">
          {showsLiveDot ? (
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                showOnline ? 'bg-green-500' : 'bg-gray-300'
              }`}
              title={showOnline ? 'Online' : 'Offline'}
            />
          ) : (
            <span className="inline-block h-2 w-2 shrink-0" aria-hidden="true" />
          )}
          {/* A focusable control so the details view is reachable by keyboard,
              not just by clicking the row. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(device);
            }}
            className="text-left text-sm font-medium hover:underline"
          >
            {device.name}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <UserNameCell device={device} orgId={orgId} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <Text size="sm">{PLATFORM_LABELS[device.platform] ?? device.platform}</Text>
          <Text size="xs" variant="muted">
            {device.osVersion}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <SourceBadge device={device} />
      </TableCell>
      <TableCell>
        <Text size="sm">{formatTimeAgo(device.lastCheckIn)}</Text>
      </TableCell>
      <TableCell>
        <CheckBadges device={device} />
      </TableCell>
      <TableCell>
        <CompliantBadge device={device} />
      </TableCell>
      <TableCell>
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open device actions"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <OverflowMenuVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ width: 'auto' }}>
              {device.source === 'manual' && onRequestEdit && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestEdit(device);
                  }}
                >
                  <Edit size={16} className="mr-2" />
                  <span className="whitespace-nowrap">Edit device</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!canRemoveDevice}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestRemove(device);
                }}
                variant="destructive"
              >
                <TrashCan size={16} className="mr-2" />
                <span className="whitespace-nowrap">Remove Device</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
