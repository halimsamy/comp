'use client';

import { ControlEvidenceTable } from '@/app/(app)/[orgId]/controls/[controlId]/components/ControlEvidenceTable';
import { summarizeEvidence, useControlEvidence } from '@/hooks/use-control-evidence';
import { Heading, Text } from '@trycompai/design-system';

/** Everything the mapped controls rely on, in one list (policies, tasks, forms, ISMS documents). */
export function RequirementEvidence({ orgId, controlIds }: { orgId: string; controlIds: string[] }) {
  const { items, isLoading, error } = useControlEvidence(controlIds);
  const { complete, total } = summarizeEvidence(items);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level="3">Evidence</Heading>
        {!isLoading && total > 0 ? (
          <Text size="sm" variant="muted">{`${complete}/${total} done`}</Text>
        ) : null}
      </div>
      <ControlEvidenceTable
        orgId={orgId}
        items={items}
        isLoading={isLoading}
        error={error}
        emptyText={controlIds.length === 0 ? 'Map a control to see its evidence here.' : 'The mapped controls have no evidence linked yet.'}
      />
    </div>
  );
}
