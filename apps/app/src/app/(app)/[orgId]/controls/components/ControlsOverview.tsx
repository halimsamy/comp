'use client';

import { type ControlOverview, useControlsOverview } from '@/hooks/use-controls-overview';
import { Skeleton, Stack, Text } from '@trycompai/design-system';
import { useMemo } from 'react';
import { summarizeControls } from '../lib/controls-overview';
import { ControlsOverviewTable } from './ControlsOverviewTable';
import { ControlsSummary } from './ControlsSummary';

export function ControlsOverview({ initialControls }: { initialControls?: ControlOverview[] }) {
  const { controls, isLoading, error } = useControlsOverview({ initialData: initialControls });
  const summary = useMemo(() => summarizeControls(controls), [controls]);

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
      <ControlsOverviewTable controls={controls} />
    </Stack>
  );
}
