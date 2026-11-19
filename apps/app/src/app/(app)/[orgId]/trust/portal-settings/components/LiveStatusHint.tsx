'use client';

import { Button, Text } from '@trycompai/design-system';
import { useState } from 'react';
import type { LiveTrustStatus } from './trust-frameworks';

const LABEL: Record<LiveTrustStatus, string> = {
  in_progress: 'In progress',
  compliant: 'Compliant',
};

/** Shows what the compliance program says and saves it to the portal in one click. */
export function LiveStatusHint({
  liveStatus,
  disabled,
  onUse,
}: {
  liveStatus: LiveTrustStatus;
  disabled?: boolean;
  onUse?: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const handleUse = async () => {
    if (!onUse) return;
    setSaving(true);
    try {
      await onUse();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Text size="sm" weight="medium">
          Live status: {LABEL[liveStatus]}
        </Text>
        <Text size="xs" variant="muted">
          {liveStatus === 'compliant'
            ? 'A completed audit in the last 12 months covers this framework.'
            : 'This framework is part of your compliance program.'}
        </Text>
      </div>
      {onUse && (
        <Button size="sm" variant="outline" onClick={handleUse} disabled={disabled || saving}>
          {saving ? 'Saving…' : 'Use live status'}
        </Button>
      )}
    </div>
  );
}
