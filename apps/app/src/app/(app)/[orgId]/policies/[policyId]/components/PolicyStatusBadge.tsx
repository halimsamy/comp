import {
  POLICY_STAGE_BADGE_CLASS,
  POLICY_STAGE_LABELS,
  type PolicyLifecycleStage,
} from '../../lib/policy-stage';

interface PolicyStatusBadgeProps {
  stage: PolicyLifecycleStage;
  isArchived?: boolean;
}

/** Lifecycle badge: "Pending approval" amber, "Review due" red. */
export function PolicyStatusBadge({ stage, isArchived }: PolicyStatusBadgeProps) {
  const key = isArchived ? 'archived' : stage;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${POLICY_STAGE_BADGE_CLASS[key]}`}
    >
      {isArchived ? 'Archived' : POLICY_STAGE_LABELS[stage]}
    </span>
  );
}
