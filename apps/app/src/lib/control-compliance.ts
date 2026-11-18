/**
 * Readers for the compliance scores computed by the API
 * (`apps/api/src/frameworks/scoring`). The app never re-computes scores, so
 * every page shows the same numbers.
 */

export type ControlScoreStatus =
  | 'completed'
  | 'in_progress'
  | 'not_started'
  | 'not_relevant'
  | 'not_applicable';

export type RequirementScoreStatus =
  | 'satisfied'
  | 'in_progress'
  | 'not_started'
  | 'no_controls'
  | 'not_relevant'
  | 'not_applicable';

export type ApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'compensating_control'
  | 'customized_approach';

export interface Tally {
  total: number;
  completed: number;
}

export interface ArtifactCounts {
  policies: Tally;
  tasks: Tally;
  documents: Tally;
  ismsDocuments: Tally;
}

export interface ControlScore {
  status: ControlScoreStatus;
  percent: number;
  counts: ArtifactCounts;
}

export interface RequirementScore {
  status: RequirementScoreStatus;
  percent: number;
  applicability: ApplicabilityStatus;
  controlsTotal: number;
  controlsComplete: number;
  counts: ArtifactCounts;
}

export interface FrameworkScores {
  complianceScore: number;
  controlsComplete: number;
  controlsTotal: number;
  controlsNotApplicable: number;
  requirementsSatisfied: number;
  requirementsTotal: number;
  requirementsNotApplicable: number;
  counts: ArtifactCounts;
  controls: Record<string, ControlScore>;
  requirements: Record<string, RequirementScore>;
  computedAt: string;
}

const EMPTY_TALLY: Tally = { total: 0, completed: 0 };

export const EMPTY_COUNTS: ArtifactCounts = {
  policies: EMPTY_TALLY,
  tasks: EMPTY_TALLY,
  documents: EMPTY_TALLY,
  ismsDocuments: EMPTY_TALLY,
};

export function getControlScore(
  scores: Pick<FrameworkScores, 'controls'> | null | undefined,
  controlId: string,
): ControlScore {
  return scores?.controls?.[controlId] ?? { status: 'not_started', percent: 0, counts: EMPTY_COUNTS };
}

export function getRequirementScore(
  scores: Pick<FrameworkScores, 'requirements'> | null | undefined,
  requirementId: string,
): RequirementScore {
  return (
    scores?.requirements?.[requirementId] ?? {
      status: 'no_controls',
      percent: 0,
      applicability: 'applicable',
      controlsTotal: 0,
      controlsComplete: 0,
      counts: EMPTY_COUNTS,
    }
  );
}

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface StatusBadge {
  label: string;
  variant: BadgeVariant;
}

const REQUIREMENT_BADGES: Record<RequirementScoreStatus, StatusBadge> = {
  satisfied: { label: 'Satisfied', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'secondary' },
  not_started: { label: 'Not Started', variant: 'destructive' },
  no_controls: { label: 'No Controls', variant: 'secondary' },
  not_relevant: { label: 'Not Relevant', variant: 'secondary' },
  not_applicable: { label: 'Not Applicable', variant: 'outline' },
};

export function getRequirementStatusBadge(status: RequirementScoreStatus): StatusBadge {
  return REQUIREMENT_BADGES[status] ?? REQUIREMENT_BADGES.in_progress;
}

export const APPLICABILITY_LABELS: Record<ApplicabilityStatus, string> = {
  applicable: 'Applicable',
  not_applicable: 'Not applicable',
  compensating_control: 'Compensating control',
  customized_approach: 'Customized approach',
};

/** Evidence forms and ISMS documents shown together in the "Documents" column. */
export function documentCounts(counts: ArtifactCounts): Tally {
  return {
    total: counts.documents.total + counts.ismsDocuments.total,
    completed: counts.documents.completed + counts.ismsDocuments.completed,
  };
}
