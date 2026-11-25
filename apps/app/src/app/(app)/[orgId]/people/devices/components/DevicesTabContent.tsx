'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { Button, Skeleton } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { useAgentDevices } from '../hooks/useAgentDevices';
import { useFleetHosts } from '../hooks/useFleetHosts';
import { AddDeviceDialog } from './AddDeviceDialog';
import { DeviceAgentDevicesList } from './DeviceAgentDevicesList';
import { DeviceComplianceChart } from './DeviceComplianceChart';
import { DeviceSyncProviderSelector } from './DeviceSyncProviderSelector';
import { EmployeeDevicesList } from './EmployeeDevicesList';

interface DevicesTabContentProps {
  isCurrentUserOwner: boolean;
}

export function DevicesTabContent({ isCurrentUserOwner }: DevicesTabContentProps) {
  const {
    agentDevices,
    isLoading: isAgentLoading,
    error: agentError,
    mutate: refreshAgentDevices,
  } = useAgentDevices();
  const { hasPermission } = usePermissions();
  const canAddDevice = hasPermission('member', 'update');
  const [addOpen, setAddOpen] = useState(false);
  const {
    fleetHosts,
    isLoading: isFleetLoading,
    error: fleetError,
  } = useFleetHosts();

  // Filter out Fleet hosts for members who already have a device-agent device.
  // Device agent takes priority over Fleet. Integration-imported devices are
  // inventory-only (no compliance data) and must NOT suppress a richer Fleet
  // host, so only true agent devices count toward de-duplication.
  const filteredFleetDevices = useMemo(() => {
    const memberIdsWithAgent = new Set(
      agentDevices
        .filter((d) => d.source === 'device_agent')
        .map((d) => d.memberId)
        .filter(Boolean),
    );
    return fleetHosts.filter(
      (host) => !host.member_id || !memberIdsWithAgent.has(host.member_id),
    );
  }, [agentDevices, fleetHosts]);

  const error = agentError ?? fleetError;

  // Show a skeleton only while the fast agent-devices fetch is in flight; the
  // slower Fleet call (hosted elsewhere) streams in separately so the page
  // doesn't block on it.
  if (isAgentLoading) {
    return (
      <div className="space-y-6">
        <div className="my-6 h-[360px] w-full">
          <Skeleton style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load device data. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
        <div className="sm:flex-1">
          <DeviceSyncProviderSelector />
        </div>
        {canAddDevice && (
          <div>
            <Button iconLeft={<Add size={16} />} onClick={() => setAddOpen(true)}>
              Add device
            </Button>
          </div>
        )}
      </div>
      <AddDeviceDialog open={addOpen} onOpenChange={setAddOpen} onAdded={refreshAgentDevices} />
      <DeviceComplianceChart
        fleetDevices={filteredFleetDevices}
        agentDevices={agentDevices}
      />

      {agentDevices.length > 0 && (
        <DeviceAgentDevicesList devices={agentDevices} />
      )}

      {isFleetLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground/70" />
          Loading devices from Fleet…
        </div>
      ) : (
        filteredFleetDevices.length > 0 && (
          <EmployeeDevicesList
            devices={filteredFleetDevices}
            isCurrentUserOwner={isCurrentUserOwner}
          />
        )
      )}
    </div>
  );
}
