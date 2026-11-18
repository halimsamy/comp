import { CHECKLIST_SECTIONS } from './checklist-catalog';
import { buildItemSpecs } from './checklist-items';
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistState,
  OnboardingChecklist,
} from './checklist-types';

/**
 * Turns live org state into the Getting Started guide. Pure: completion comes from
 * real data; the only stored input is which items the team skipped.
 */
export function buildChecklist(state: ChecklistState): OnboardingChecklist {
  const specs = buildItemSpecs(state);
  const titles = new Map(specs.map((spec) => [spec.id, spec.title]));
  const resolved = new Set(
    specs
      .filter((spec) => spec.done || state.skips[spec.id])
      .map((spec) => spec.id),
  );

  const sectionOf = new Map(specs.map((spec) => [spec.id, spec.section]));
  const items: ChecklistItem[] = specs.map((spec) => {
    const dependsOn = (spec.dependsOn ?? []).filter((id) => titles.has(id));
    const skip = spec.done ? null : (state.skips[spec.id] ?? null);
    const blocking = dependsOn.filter((id) => !resolved.has(id));
    const lockedReason =
      spec.lockedReason ||
      (blocking.length > 0
        ? `Finish first: ${blocking.map((id) => titles.get(id)).join(', ')}.`
        : null);

    let status: ChecklistItemStatus = 'todo';
    if (spec.done) status = 'done';
    else if (skip) status = 'skipped';
    else if (lockedReason) status = 'locked';

    return {
      id: spec.id,
      title: spec.title,
      description: spec.description,
      status,
      href: spec.href,
      ctaLabel: spec.ctaLabel,
      references: spec.references,
      dependsOn,
      lockedReason: status === 'locked' ? lockedReason : null,
      progress: spec.progress ?? null,
      skip,
    };
  });

  const isResolved = (item: ChecklistItem) =>
    item.status === 'done' || item.status === 'skipped';

  const sections = CHECKLIST_SECTIONS.map((section) => {
    const sectionItems = items.filter(
      (item) => sectionOf.get(item.id) === section.id,
    );
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      items: sectionItems,
      completed: sectionItems.filter(isResolved).length,
      total: sectionItems.length,
    };
  }).filter((section) => section.total > 0);

  const total = items.length;
  const completed = items.filter(isResolved).length;
  return {
    sections,
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    isComplete: completed === total,
  };
}
