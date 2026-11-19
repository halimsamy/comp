import { Text } from '@trycompai/design-system';
import type { ApplicabilityDetails } from './applicability-schema';
import type { ControlOption } from './CompensatingControlFields';

/** Read-only summary of the CCW / customized approach worksheet, or the cascade source. */
export function ApplicabilityDetailsSummary({
  details,
  controlOptions,
}: {
  details: ApplicabilityDetails | null | undefined;
  controlOptions: ControlOption[];
}) {
  if (!details) return null;
  if (details.kind === 'not_applicable') {
    return details.sourceRequirementId ? (
      <Text size="xs" variant="muted">
        Set from its parent requirement.
      </Text>
    ) : null;
  }
  if (details.kind === 'compensating_control') {
    const names = details.compensatingControlIds.map(
      (id) => controlOptions.find((c) => c.id === id)?.name ?? id,
    );
    const due = new Date(details.revalidateAt);
    const overdue = due.getTime() < Date.now();
    return (
      <div className="flex flex-col gap-1">
        <Text size="xs" variant="muted">{`Objective: ${details.objective}`}</Text>
        <Text size="xs" variant="muted">{`Compensating controls: ${names.join(', ')}`}</Text>
        <Text size="xs" variant={overdue ? 'destructive' : 'muted'}>
          {`${overdue ? 'Re-validation overdue since' : 'Re-validate by'} ${due.toLocaleDateString()}`}
        </Text>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Text size="xs" variant="muted">{`Objective: ${details.objective}`}</Text>
      <Text size="xs" variant="muted">
        {`Controls matrix: ${details.matrix.length} control${details.matrix.length === 1 ? '' : 's'} · targeted risk analysis linked`}
      </Text>
    </div>
  );
}
