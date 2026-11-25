import { Text } from '@trycompai/design-system';
import type { DeviceWithChecks } from '../types';

function attestationLabel(attestation: DeviceWithChecks['attestation']): string {
  const by = attestation?.by ?? 'Not recorded';
  return attestation?.at ? `${by} on ${new Date(attestation.at).toLocaleDateString()}` : by;
}

function sourceInfo(device: DeviceWithChecks): { label: string; value: string } {
  if (device.source === 'integration') {
    return { label: 'Source', value: device.integrationProvider?.name ?? 'Integration' };
  }
  if (device.source === 'manual') {
    return { label: 'Checks attested by', value: attestationLabel(device.attestation) };
  }
  return { label: 'Agent Version', value: device.agentVersion ?? 'N/A' };
}

/** Where a device's checks come from: its sync provider, its agent, or who attested them by hand. */
export function DeviceSourceInfo({ device }: { device: DeviceWithChecks }) {
  const { label, value } = sourceInfo(device);
  return (
    <div>
      <Text size="sm" variant="muted">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
    </div>
  );
}
