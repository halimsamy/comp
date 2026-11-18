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
  const items = checklist.sections.flatMap((section) => section.items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const count = (ids: string[]) => {
    const present = ids.map((id) => byId.get(id)).filter((item): item is ChecklistItem => !!item);
    return { done: present.filter(isResolved).length, total: present.length };
  };

  const milestones: Milestone[] = [
    {
      id: 'systems',
      label: 'key systems connected',
      ...count(['identity_provider', 'cloud_provider', 'version_control', 'device_monitoring']),
    },
    {
      id: 'policies',
      label: 'policy steps complete',
      ...count(['policies_published', 'policies_acknowledged']),
    },
    {
      id: 'isms',
      label: 'ISMS documents and SoA approved',
      ...count(['isms_documents', 'statement_of_applicability']),
    },
    { id: 'auditor', label: 'auditor invited', ...count(['auditor_access']) },
  ];
  return milestones.filter((milestone) => milestone.total > 0);
}
