/**
 * The single compliance scoring source. Every score the UI shows (framework %,
 * N/M controls, requirement and control status) is computed here, in the API.
 *
 * - A policy counts when published; a task when done or not relevant.
 * - An evidence form counts when its latest non-rejected submission is inside
 *   the form's cadence (per-form `cadenceMonths`).
 * - A linked ISMS document counts when it has a published version.
 * - Requirements marked not applicable are excluded, and so are controls that
 *   only map to not-applicable requirements.
 */

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

export interface ScoringControl {
  id: string;
  policies: { id: string; status: string }[];
  tasks: { id: string; status: string }[];
  /** Linked form types, excluding those the org marked not relevant. */
  formTypes: string[];
  hasNotRelevantForms: boolean;
  ismsDocuments: { id: string; published: boolean }[];
}

export interface ScoringContext {
  /** Form types whose latest non-rejected submission is inside its cadence. */
  freshForms: Set<string>;
  /** Form types with at least one non-rejected submission. */
  submittedForms: Set<string>;
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

export interface FrameworkScore {
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

const isPolicyDone = (status: string) => status === 'published';
const isTaskDone = (status: string) => status === 'done' || status === 'not_relevant';

/** Unique artifacts across controls (one policy shared by 3 controls counts once). */
export function tallyArtifacts(controls: ScoringControl[], ctx: ScoringContext): ArtifactCounts {
  const policies = new Map<string, string>();
  const tasks = new Map<string, string>();
  const forms = new Set<string>();
  const isms = new Map<string, boolean>();
  for (const control of controls) {
    for (const p of control.policies) policies.set(p.id, p.status);
    for (const t of control.tasks) tasks.set(t.id, t.status);
    for (const f of control.formTypes) forms.add(f);
    for (const d of control.ismsDocuments) isms.set(d.id, d.published);
  }
  const count = <T>(values: Iterable<T>, done: (v: T) => boolean): Tally => {
    const list = [...values];
    return { total: list.length, completed: list.filter(done).length };
  };
  return {
    policies: count(policies.values(), isPolicyDone),
    tasks: count(tasks.values(), isTaskDone),
    documents: count(forms, (f) => ctx.freshForms.has(f)),
    ismsDocuments: count(isms.values(), (published) => published),
  };
}

export function sumTallies(counts: ArtifactCounts): Tally {
  return Object.values(counts).reduce(
    (sum: Tally, t: Tally) => ({ total: sum.total + t.total, completed: sum.completed + t.completed }),
    { total: 0, completed: 0 },
  );
}

const percentOf = ({ total, completed }: Tally) =>
  total === 0 ? 0 : Math.round((completed / total) * 100);

export function scoreControl(control: ScoringControl, ctx: ScoringContext): ControlScore {
  const counts = tallyArtifacts([control], ctx);
  const sum = sumTallies(counts);
  if (sum.total === 0) {
    return control.hasNotRelevantForms
      ? { status: 'not_relevant', percent: 100, counts }
      : { status: 'not_started', percent: 0, counts };
  }
  if (sum.completed === sum.total) return { status: 'completed', percent: 100, counts };
  const started =
    sum.completed > 0 ||
    control.policies.some((p) => p.status !== 'draft') ||
    control.tasks.some((t) => t.status !== 'todo') ||
    control.formTypes.some((f) => ctx.submittedForms.has(f));
  return { status: started ? 'in_progress' : 'not_started', percent: percentOf(sum), counts };
}

const isControlDone = (s: ControlScoreStatus) => s === 'completed' || s === 'not_relevant';

function requirementStatus(statuses: ControlScoreStatus[]): RequirementScoreStatus {
  if (statuses.length === 0) return 'no_controls';
  if (statuses.every((s) => s === 'not_relevant')) return 'not_relevant';
  if (statuses.every(isControlDone)) return 'satisfied';
  if (statuses.every((s) => s === 'not_started')) return 'not_started';
  return 'in_progress';
}

export function scoreFramework({
  controls,
  requirements,
  applicability,
  ctx,
  now = new Date(),
}: {
  controls: ScoringControl[];
  /** Every requirement of the framework with the controls mapped to it. */
  requirements: { key: string; controlIds: string[] }[];
  applicability: Map<string, ApplicabilityStatus>;
  ctx: ScoringContext;
  now?: Date;
}): FrameworkScore {
  const byId = new Map(controls.map((c) => [c.id, c]));
  const isNotApplicable = (key: string) => applicability.get(key) === 'not_applicable';

  // A control is out of scope when every requirement it maps to is N/A.
  const mappedTo = new Map<string, string[]>();
  for (const req of requirements) {
    for (const id of req.controlIds) mappedTo.set(id, [...(mappedTo.get(id) ?? []), req.key]);
  }
  const outOfScope = (id: string) => {
    const keys = mappedTo.get(id) ?? [];
    return keys.length > 0 && keys.every(isNotApplicable);
  };

  const controlScores: Record<string, ControlScore> = {};
  for (const control of controls) {
    const score = scoreControl(control, ctx);
    controlScores[control.id] = outOfScope(control.id) ? { ...score, status: 'not_applicable' } : score;
  }

  const requirementScores: Record<string, RequirementScore> = {};
  for (const req of requirements) {
    const mapped = req.controlIds.filter((id) => byId.has(id));
    const scores = mapped.map((id) => scoreControl(byId.get(id)!, ctx));
    const status = isNotApplicable(req.key) ? 'not_applicable' : requirementStatus(scores.map((s) => s.status));
    requirementScores[req.key] = {
      status,
      applicability: applicability.get(req.key) ?? 'applicable',
      percent: scores.length === 0 ? 0 : Math.round(scores.reduce((a, s) => a + s.percent, 0) / scores.length),
      controlsTotal: scores.length,
      controlsComplete: scores.filter((s) => isControlDone(s.status)).length,
      counts: tallyArtifacts(mapped.map((id) => byId.get(id)!), ctx),
    };
  }

  const inScope = controls.filter((c) => controlScores[c.id].status !== 'not_applicable');
  const counts = tallyArtifacts(inScope, ctx);
  const applicableRequirements = Object.values(requirementScores).filter(
    (r) => r.status !== 'not_applicable',
  );

  return {
    complianceScore: percentOf(sumTallies(counts)),
    controlsComplete: inScope.filter((c) => isControlDone(controlScores[c.id].status)).length,
    controlsTotal: inScope.length,
    controlsNotApplicable: controls.length - inScope.length,
    requirementsSatisfied: applicableRequirements.filter((r) => r.status === 'satisfied').length,
    requirementsTotal: applicableRequirements.length,
    requirementsNotApplicable: requirements.length - applicableRequirements.length,
    counts,
    controls: controlScores,
    requirements: requirementScores,
    computedAt: now.toISOString(),
  };
}
