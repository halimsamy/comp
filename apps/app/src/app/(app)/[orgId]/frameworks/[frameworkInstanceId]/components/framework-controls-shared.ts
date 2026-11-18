import {
  type ArtifactCounts,
  type ApplicabilityStatus,
  type FrameworkScores,
  type RequirementScoreStatus,
  type StatusBadge,
  getRequirementScore,
} from '@/lib/control-compliance';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import type { FrameworkEditorRequirement } from '@db';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface ControlItem {
  control: FrameworkInstanceWithControls['controls'][number];
  requirements: Array<{ id: string; name: string; identifier: string }>;
}

export function getStatusBadge(status: string): StatusBadge {
  switch (status) {
    case 'completed':
      return { label: 'Satisfied', variant: 'default' };
    case 'in_progress':
      return { label: 'In Progress', variant: 'secondary' };
    case 'not_relevant':
      return { label: 'Not Relevant', variant: 'secondary' };
    case 'not_applicable':
      return { label: 'Not Applicable', variant: 'outline' };
    default:
      return { label: 'Not Started', variant: 'destructive' };
  }
}

export function buildRequirementMap(
  requirementDefinitions: FrameworkEditorRequirement[],
): Map<string, { id: string; name: string; identifier: string }> {
  const map = new Map<string, { id: string; name: string; identifier: string }>();
  for (const req of requirementDefinitions) {
    map.set(req.id, { id: req.id, name: req.name, identifier: req.identifier ?? '' });
  }
  return map;
}

export function buildControlItems(
  controls: FrameworkInstanceWithControls['controls'],
  requirementMap: Map<string, { id: string; name: string; identifier: string }>,
): ControlItem[] {
  return controls.map((control) => {
    const requirements = (control.requirementsMapped ?? [])
      .map((rm) => (rm.requirementId ? requirementMap.get(rm.requirementId) : undefined))
      .filter((r): r is { id: string; name: string; identifier: string } => r != null);
    return { control, requirements };
  });
}

/** Sentinel value for uncategorized controls — avoids collision with a real family named "Other". */
export const UNCATEGORIZED_FAMILY = '__uncategorized__';

/** Display label for the uncategorized family group. */
export const UNCATEGORIZED_FAMILY_LABEL = 'Other';

export interface FamilyGroup {
  family: string;
  items: ControlItem[];
}

export function groupByFamily(items: ControlItem[]): FamilyGroup[] {
  const familyMap = new Map<string, ControlItem[]>();
  const otherItems: ControlItem[] = [];

  for (const item of items) {
    const family = item.control.controlFamily;
    if (family) {
      const existing = familyMap.get(family);
      if (existing) {
        existing.push(item);
      } else {
        familyMap.set(family, [item]);
      }
    } else {
      otherItems.push(item);
    }
  }

  const sortedFamilies = Array.from(familyMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const groups: FamilyGroup[] = sortedFamilies.map(([family, items]) => ({
    family,
    items: items.sort((a, b) => a.control.name.localeCompare(b.control.name, undefined, { numeric: true })),
  }));

  if (otherItems.length > 0) {
    groups.push({
      family: UNCATEGORIZED_FAMILY,
      items: otherItems.sort((a, b) => a.control.name.localeCompare(b.control.name, undefined, { numeric: true })),
    });
  }

  return groups;
}

/** Returns the display label for a family key (handles the uncategorized sentinel). */
export function getFamilyDisplayLabel(family: string): string {
  return family === UNCATEGORIZED_FAMILY ? UNCATEGORIZED_FAMILY_LABEL : family;
}

// ---------------------------------------------------------------------------
// Requirement grouping
// ---------------------------------------------------------------------------

export interface RequirementItem extends FrameworkEditorRequirement {
  mappedControlsCount: number;
  satisfiedControlsCount: number;
  compliancePercent: number;
  status: RequirementScoreStatus;
  applicability: ApplicabilityStatus;
  artifactCounts: ArtifactCounts;
}

export interface RequirementFamilyGroup {
  family: string;
  items: RequirementItem[];
}

/**
 * FRAME-18: order requirements by their per-framework `sortOrder` (numbered
 * rows first, ascending), falling back to identifier (then name) for unset
 * rows and ties. Unset (`null`/`undefined`) rows always sort last.
 */
export function compareRequirementsByOrder(
  a: Pick<FrameworkEditorRequirement, 'sortOrder' | 'identifier' | 'name'>,
  b: Pick<FrameworkEditorRequirement, 'sortOrder' | 'identifier' | 'name'>,
): number {
  const ao = a.sortOrder ?? null;
  const bo = b.sortOrder ?? null;
  if (ao !== bo) {
    if (ao == null) return 1;
    if (bo == null) return -1;
    return ao - bo;
  }
  return (a.identifier ?? a.name).localeCompare(b.identifier ?? b.name, undefined, {
    numeric: true,
  });
}

export function groupRequirementsByFamily(items: RequirementItem[]): RequirementFamilyGroup[] {
  const familyMap = new Map<string, RequirementItem[]>();
  const otherItems: RequirementItem[] = [];

  for (const item of items) {
    const family = item.requirementFamily;
    if (family) {
      const existing = familyMap.get(family);
      if (existing) {
        existing.push(item);
      } else {
        familyMap.set(family, [item]);
      }
    } else {
      otherItems.push(item);
    }
  }

  // FRAME-18: order families by the lowest sortOrder among their requirements so
  // a framework's configured order also drives the family order (e.g. NIST CSF
  // Functions GV → ID → PR → DE → RS → RC). When no requirement has a sortOrder
  // (every existing framework today), every family's min is null and this falls
  // back to alphabetical — identical to the previous behavior.
  const minSortOrder = (familyItems: RequirementItem[]): number | null => {
    let min: number | null = null;
    for (const item of familyItems) {
      if (item.sortOrder == null) continue;
      if (min === null || item.sortOrder < min) min = item.sortOrder;
    }
    return min;
  };
  const sortedFamilies = Array.from(familyMap.entries()).sort(([fa, ia], [fb, ib]) => {
    const ma = minSortOrder(ia);
    const mb = minSortOrder(ib);
    if (ma !== mb) {
      if (ma === null) return 1;
      if (mb === null) return -1;
      return ma - mb;
    }
    return fa.localeCompare(fb);
  });

  const sortItems = compareRequirementsByOrder;

  const groups: RequirementFamilyGroup[] = sortedFamilies.map(([family, familyItems]) => ({
    family,
    items: familyItems.sort(sortItems),
  }));

  if (otherItems.length > 0) {
    groups.push({
      family: UNCATEGORIZED_FAMILY,
      items: otherItems.sort(sortItems),
    });
  }

  return groups;
}

/** Requirement rows carrying the API score (see lib/control-compliance). */
export function buildRequirementItems(
  requirementDefinitions: FrameworkEditorRequirement[],
  scores: FrameworkScores | null | undefined,
): RequirementItem[] {
  return requirementDefinitions.map((def) => {
    const score = getRequirementScore(scores, def.id);
    return {
      ...def,
      mappedControlsCount: score.controlsTotal,
      satisfiedControlsCount: score.controlsComplete,
      compliancePercent: score.percent,
      status: score.status,
      applicability: score.applicability,
      artifactCounts: score.counts,
    };
  });
}
