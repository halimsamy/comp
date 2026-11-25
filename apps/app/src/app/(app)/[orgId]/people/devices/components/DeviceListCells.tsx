'use client';

import {
  Badge,
  Text,
} from '@trycompai/design-system';
import {
  Information,
} from '@trycompai/design-system/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@trycompai/ui/tooltip';
import Link from 'next/link';
import type { DeviceWithChecks } from '../types';
import {
  CANONICAL_DEVICE_CHECKS,
  CHECK_FIELDS,
  computeSourceComplianceVerdict,
  isComplianceTracked,
  notTrackedTooltipCopy,
  sourceChecks,
  sourceLabel,
  sourceReportedTooltipCopy,
  staleLabel,
  staleTooltipCopy,
  unverifiedTooltipCopy,
} from '../lib/device-source';

function InfoTooltip({ label, copy }: { label: string; copy: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Information size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{copy}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SourceBadge({ device }: { device: DeviceWithChecks }) {
  return <Badge variant="outline">{sourceLabel(device)}</Badge>;
}

export function UserNameCell({
  device,
  orgId,
}: {
  device: DeviceWithChecks;
  orgId: string;
}) {
  const memberId = device.memberId;

  if (!memberId) {
    return (
      <div className="flex flex-col">
        <Text size="sm" weight="medium">{device.user.name}</Text>
        <Text size="xs" variant="muted">{device.user.email}</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Link
        href={`/${orgId}/people/${memberId}`}
        className="truncate text-sm font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {device.user.name}
      </Link>
      <Text size="xs" variant="muted">{device.user.email}</Text>
    </div>
  );
}

/**
 * Compliance badge for an integration-imported device. Shared with the details
 * panel so the "Not tracked" copy and provider fallback stay consistent.
 */
export function NotTrackedBadge({ device }: { device: DeviceWithChecks }) {
  return (
    <div className="flex items-center gap-1">
      <Badge variant="secondary">Not tracked</Badge>
      <InfoTooltip
        label="Why is compliance not tracked?"
        copy={notTrackedTooltipCopy(device)}
      />
    </div>
  );
}

export function CompliantBadge({ device }: { device: DeviceWithChecks }) {
  // Integration-imported devices are judged by CompAI's OWN standard — the
  // same four canonical checks the Comp agent measures — computed from the
  // source-reported check data. The vendor's own verdict (e.g. Intune
  // complianceState) is informational-only in the details panel: it reflects
  // the customer's MDM policy configuration, not the framework standard.
  if (!isComplianceTracked(device)) {
    const verdict = computeSourceComplianceVerdict(device);
    if (verdict === null || verdict.kind === 'not_tracked') {
      return <NotTrackedBadge device={device} />;
    }
    if (verdict.kind === 'non_compliant') {
      return <Badge variant="destructive">No</Badge>;
    }
    if (verdict.kind === 'compliant') {
      return <Badge variant="default">Yes</Badge>;
    }
    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary">
          Unverified ({verdict.reported}/{CANONICAL_DEVICE_CHECKS.length})
        </Badge>
        <InfoTooltip
          label="Why is compliance unverified?"
          copy={unverifiedTooltipCopy(device, verdict)}
        />
      </div>
    );
  }

  if (device.complianceStatus === 'stale') {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary">{staleLabel(device.daysSinceLastCheckIn)}</Badge>
        <InfoTooltip
          label="What does Stale mean?"
          copy={staleTooltipCopy(device.daysSinceLastCheckIn)}
        />
      </div>
    );
  }
  if (device.complianceStatus === 'compliant') {
    return <Badge variant="default">Yes</Badge>;
  }
  return <Badge variant="destructive">No</Badge>;
}

export function CheckBadges({ device }: { device: DeviceWithChecks }) {
  // Imported devices: render whatever checks the SOURCE reported, in the
  // provider's own naming. Nothing reported → placeholder dashes, as before.
  if (!isComplianceTracked(device)) {
    const checks = sourceChecks(device);
    if (checks.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {checks.map((check) => (
            <Badge
              key={check.id}
              variant={check.passed ? 'default' : 'destructive'}
              title={`${check.label} — ${sourceReportedTooltipCopy(device)}`}
            >
              {check.label}
            </Badge>
          ))}
        </div>
      );
    }
  }
  if (!isComplianceTracked(device) || device.complianceStatus === 'stale') {
    const reason = !isComplianceTracked(device)
      ? 'not collected for imported devices'
      : 'unknown (device is stale)';
    return (
      <div className="flex flex-wrap gap-1">
        {CHECK_FIELDS.map(({ key, label }) => (
          <Badge key={key} variant="secondary" title={`${label} — ${reason}`}>
            —
          </Badge>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {CHECK_FIELDS.map(({ key, label }) => (
        <Badge key={key} variant={device[key] ? 'default' : 'destructive'}>
          {label}
        </Badge>
      ))}
    </div>
  );
}
