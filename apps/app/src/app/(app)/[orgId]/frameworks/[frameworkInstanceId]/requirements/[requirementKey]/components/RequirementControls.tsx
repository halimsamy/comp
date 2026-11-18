'use client';

import {
  type ControlScore,
  type RequirementScore,
  getRequirementStatusBadge,
} from '@/lib/control-compliance';
import type { Control, RequirementMap } from '@db';
import { Badge, Heading, Text } from '@trycompai/design-system';
import { RequirementControlsTable } from './table/RequirementControlsTable';

interface RequirementControlsProps {
  relatedControls: (RequirementMap & { control: Control })[];
  requirementScore: RequirementScore | null;
  controlScores: Record<string, ControlScore>;
  frameworkInstanceId: string;
}

export function RequirementControls({
  relatedControls,
  requirementScore,
  controlScores,
  frameworkInstanceId,
}: RequirementControlsProps) {
  const controls = relatedControls.map((rc) => rc.control);
  const totalControls = requirementScore?.controlsTotal ?? controls.length;
  const compliantControls = requirementScore?.controlsComplete ?? 0;
  const percent = requirementScore?.percent ?? 0;
  const badge = getRequirementStatusBadge(requirementScore?.status ?? 'no_controls');

  return (
    <div className="space-y-4">
      {totalControls > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <Text size="sm" variant="muted">
              {percent}% complete
            </Text>
            <Text size="sm" variant="muted">
              {compliantControls}/{totalControls} controls complete
            </Text>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/50">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Heading level="3">Controls</Heading>
        <span className="text-muted-foreground bg-muted/50 rounded-xs px-2 py-1 text-xs tabular-nums">
          {controls.length}
        </span>
      </div>

      <RequirementControlsTable
        controls={controls}
        controlScores={controlScores}
        frameworkInstanceId={frameworkInstanceId}
      />
    </div>
  );
}
