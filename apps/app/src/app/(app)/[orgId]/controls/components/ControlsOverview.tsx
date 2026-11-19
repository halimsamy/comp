'use client';

import { type ControlOverview, useControlsOverview } from '@/hooks/use-controls-overview';
import { usePermissions } from '@/hooks/use-permissions';
import { Button, Skeleton, Stack, Text } from '@trycompai/design-system';
import { UserMultiple } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { summarizeControls } from '../lib/controls-overview';
import { ControlsOverviewTable } from './ControlsOverviewTable';
import { ControlsSummary } from './ControlsSummary';
import { SuggestOwnersSheet } from './SuggestOwnersSheet';

export function ControlsOverview({ initialControls }: { initialControls?: ControlOverview[] }) {
  const { controls, isLoading, error, bulkSetOwner } = useControlsOverview({ initialData: initialControls });
  const summary = useMemo(() => summarizeControls(controls), [controls]);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('control', 'update');
  const [suggestOpen, setSuggestOpen] = useState(false);

  if (isLoading) return <Skeleton style={{ height: 320 }} />;
  if (error && controls.length === 0) {
    return (
      <Text size="sm" variant="muted">
        Could not load controls. Refresh the page to try again.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <ControlsSummary summary={summary} />
      {canEdit && controls.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" iconLeft={<UserMultiple size={16} />} onClick={() => setSuggestOpen(true)}>
            Suggest owners
          </Button>
        </div>
      )}
      <ControlsOverviewTable controls={controls} canEdit={canEdit} bulkSetOwner={bulkSetOwner} />
      {canEdit && (
        <SuggestOwnersSheet open={suggestOpen} onOpenChange={setSuggestOpen} bulkSetOwner={bulkSetOwner} />
      )}
    </Stack>
  );
}
