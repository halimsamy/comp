import type { ChecklistItem, OnboardingChecklist } from '@/hooks/use-onboarding-checklist';

export interface Milestone {
  id: string;
  label: string;
  done: number;
  total: number;
}

const isResolved = (item: ChecklistItem) => item.status === 'done' || item.status === 'skipped';

/** The audit-unblocking outcomes, reduced from the checklist (Vanta's "Starter Guide Progress" card). */
export function getMilestones(checklist: OnboardingChecklist): Milestone[] {
  const resolved = (items: ChecklistItem[]) => ({
    done: items.filter(isResolved).length,
    total: items.length,
  });
  // #7: a milestone counts every step of its section, so its total matches the section card.
  const section = (id: string) =>
    resolved(checklist.sections.find((s) => s.id === id)?.items ?? []);
  const auditor = checklist.sections
    .flatMap((s) => s.items)
    .filter((item) => item.id === 'auditor_access');

  const milestones: Milestone[] = [
    { id: 'systems', label: 'key systems connected', ...section('systems') },
    { id: 'policies', label: 'policy steps complete', ...section('policies') },
    { id: 'isms', label: 'ISMS and scope steps complete', ...section('isms') },
    { id: 'auditor', label: 'auditor invited', ...resolved(auditor) },
  ];
  return milestones.filter((milestone) => milestone.total > 0);
}
