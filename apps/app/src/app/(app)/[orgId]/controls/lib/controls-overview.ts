import type {
  ControlEvidenceStatus,
  ControlOverview,
  EvidenceTally,
} from '@/hooks/use-controls-overview';
import { shortFrameworkName } from '@/components/related-controls/RequirementCodes';

export const ALL = 'all';
export const UNASSIGNED = 'unassigned';
export const NEEDS_REASSIGNMENT = 'needs_reassignment';

export const STATUS_LABEL: Record<ControlEvidenceStatus, string> = {
  completed: 'Complete',
  in_progress: 'In progress',
  not_started: 'Not started',
  no_evidence: 'No evidence',
};

export interface ControlsFilters {
  search: string;
  framework: string;
  owner: string;
  status: string;
}

export const EMPTY_FILTERS: ControlsFilters = {
  search: '',
  framework: ALL,
  owner: ALL,
  status: ALL,
};

/** Search matches the control name, description or any requirement code ("A.5.15", "7.2.1"). */
export function filterControls({
  controls,
  filters,
}: {
  controls: ControlOverview[];
  filters: ControlsFilters;
}): ControlOverview[] {
  const search = filters.search.trim().toLowerCase();
  return controls.filter((control) => {
    if (filters.status !== ALL && control.status !== filters.status) return false;
    if (
      filters.framework !== ALL &&
      !control.frameworks.some((f) => shortFrameworkName(f.frameworkName) === filters.framework)
    ) {
      return false;
    }
    if (filters.owner === UNASSIGNED && control.owner) return false;
    if (filters.owner === NEEDS_REASSIGNMENT && !control.owner?.deactivated) return false;
    if (
      ![ALL, UNASSIGNED, NEEDS_REASSIGNMENT].includes(filters.owner) &&
      control.owner?.id !== filters.owner
    ) {
      return false;
    }
    if (!search) return true;
    const haystack = [
      control.name,
      control.description,
      ...control.frameworks.flatMap((f) => f.requirements.map((r) => r.identifier)),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });
}

/** Distinct framework (short) names and owners, for the filter menus. */
export function filterOptions(controls: ControlOverview[]) {
  const frameworks = [
    ...new Set(controls.flatMap((c) => c.frameworks.map((f) => shortFrameworkName(f.frameworkName)))),
  ].sort((a, b) => a.localeCompare(b));
  const owners = [
    ...new Map(
      controls.flatMap((c) => (c.owner ? [[c.owner.id, c.owner.name] as const] : [])),
    ).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { frameworks, owners };
}

const add = (a: EvidenceTally, b: EvidenceTally): EvidenceTally => ({
  total: a.total + b.total,
  completed: a.completed + b.completed,
});

const ZERO: EvidenceTally = { total: 0, completed: 0 };

/** Assignment (Vanta donut) and completion (controls OK, per evidence type) summaries. */
export function summarizeControls(controls: ControlOverview[]) {
  const needsReassignment = controls.filter((c) => c.owner?.deactivated).length;
  const assigned = controls.filter((c) => c.owner && !c.owner.deactivated).length;
  const evidence = controls.reduce(
    (sum, c) => ({
      policies: add(sum.policies, c.evidence.policies),
      tasks: add(sum.tasks, c.evidence.tasks),
      forms: add(sum.forms, c.evidence.forms),
      ismsDocuments: add(sum.ismsDocuments, c.evidence.ismsDocuments),
    }),
    { policies: ZERO, tasks: ZERO, forms: ZERO, ismsDocuments: ZERO },
  );
  return {
    total: controls.length,
    assigned,
    needsReassignment,
    unassigned: controls.length - assigned - needsReassignment,
    completed: controls.filter((c) => c.status === 'completed').length,
    evidence,
  };
}

export function percent({ completed, total }: EvidenceTally): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}
