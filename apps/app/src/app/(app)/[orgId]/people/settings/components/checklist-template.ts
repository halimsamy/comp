export interface TemplateItem {
  id: string;
  title: string;
  description: string | null;
  evidenceRequired: boolean;
  sortOrder: number;
  isDefault: boolean;
  isEnabled: boolean;
  dueDays?: number | null;
  autoCompleteSource?: string | null;
  appliesToRoles?: string[];
  appliesToDepartments?: string[];
}

export type ChecklistKind = 'onboarding' | 'offboarding';

export const TEMPLATE_ENDPOINT = '/v1/offboarding-checklist/template';

export const KIND_COPY: Record<ChecklistKind, { title: string; description: string; dueFrom: string }> = {
  offboarding: {
    title: 'Offboarding checklist',
    description: 'Configure the default checklist items for employee offboarding.',
    dueFrom: 'offboard date',
  },
  onboarding: {
    title: 'Onboarding checklist',
    description:
      'Items every new hire completes, with a due date counted from their start date. Automatic items complete themselves from policies, training, device and background check status.',
    dueFrom: 'start date',
  },
};

export const CHECKLIST_ROLES = ['employee', 'contractor', 'admin', 'owner', 'auditor'];
export const CHECKLIST_DEPARTMENTS = ['admin', 'gov', 'hr', 'it', 'itsm', 'qms'];

/** "Everyone", or the roles and departments an item is targeted at (#91). */
export function audienceLabel(item: Pick<TemplateItem, 'appliesToRoles' | 'appliesToDepartments'>): string | null {
  const roles = item.appliesToRoles ?? [];
  const departments = item.appliesToDepartments ?? [];
  if (roles.length === 0 && departments.length === 0) return null;
  return [roles.join(', '), departments.map((d) => d.toUpperCase()).join(', ')].filter(Boolean).join(' · ');
}
