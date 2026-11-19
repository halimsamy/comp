import { addMonths, TRAINING_VALIDITY_MONTHS } from '../training/training-cycles';
import type { MemberNativeState } from './member-native-state';

export type ComplianceStatus =
  | 'complete'
  | 'in_progress'
  | 'incomplete'
  | 'overdue'
  | 'expired'
  | 'not_required';

export interface ComplianceItem {
  key: string;
  title: string;
  status: ComplianceStatus;
  detail: string;
  completedAt: Date | null;
  dueDate: Date | null;
  expiresAt: Date | null;
  /** Counts for table cells, when the item has them. */
  completed?: number;
  total?: number;
}

const IN_FLIGHT_CHECKS = ['invited', 'in_progress', 'in_review'];

function item(fields: Partial<ComplianceItem> & Pick<ComplianceItem, 'key' | 'title' | 'status' | 'detail'>): ComplianceItem {
  return { completedAt: null, dueDate: null, expiresAt: null, ...fields };
}

export function policiesItem(state: MemberNativeState): ComplianceItem {
  const { required, accepted } = state.policies;
  return item({
    key: 'policies',
    title: 'Accept security policies',
    status: required === 0 ? 'not_required' : accepted === required ? 'complete' : 'incomplete',
    detail: required === 0 ? 'No policies require a signature' : `${accepted} of ${required} accepted`,
    completed: accepted,
    total: required,
  });
}

export function trainingItem(state: MemberNativeState): ComplianceItem {
  const t = state.training;
  if (!t.generalRequired && !t.hipaaRequired) {
    return item({ key: 'training', title: 'Security awareness training', status: 'not_required', detail: 'Training step is turned off' });
  }
  const generalDone = !t.generalRequired || t.generalCompletedAt !== null;
  const hipaaDone = !t.hipaaRequired || t.hipaaCompletedAt !== null;
  const done = generalDone && hipaaDone;
  const completedAt = t.generalCompletedAt ?? t.hipaaCompletedAt;
  const renewFrom = [t.generalRequired ? t.generalOldestAt : null, t.hipaaRequired ? t.hipaaCompletedAt : null]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const parts = [
    ...(t.generalRequired ? [`${t.generalCompleted} of ${t.generalTotal} videos`] : []),
    ...(t.hipaaRequired ? [`HIPAA ${t.hipaaCompletedAt ? 'done' : 'pending'}`] : []),
    ...(!done && t.hadExpiredCycle ? ['12-month renewal due'] : []),
  ];
  return item({
    key: 'training',
    title: 'Security awareness training',
    status: done ? 'complete' : t.hadExpiredCycle ? 'expired' : t.generalCompleted > 0 ? 'in_progress' : 'incomplete',
    detail: parts.join(' · '),
    completedAt: done ? completedAt : null,
    expiresAt: done && renewFrom ? addMonths({ date: renewFrom, months: TRAINING_VALIDITY_MONTHS }) : null,
    completed: (t.generalRequired ? t.generalCompleted : 0) + (t.hipaaRequired && t.hipaaCompletedAt ? 1 : 0),
    total: (t.generalRequired ? t.generalTotal : 0) + (t.hipaaRequired ? 1 : 0),
  });
}

export function roleTrainingItem(state: MemberNativeState): ComplianceItem {
  const modules = state.training.modules;
  const done = modules.filter((m) => m.status === 'completed').length;
  const status: ComplianceStatus =
    done === modules.length ? 'complete' : modules.some((m) => m.status === 'expired') ? 'expired' : 'incomplete';
  const expiries = modules.flatMap((m) => (m.expiresAt ? [m.expiresAt.getTime()] : []));
  return item({
    key: 'role_training',
    title: 'Role-based training',
    status,
    detail: `${done} of ${modules.length} modules`,
    completed: done,
    total: modules.length,
    expiresAt: status === 'complete' && expiries.length > 0 ? new Date(Math.min(...expiries)) : null,
  });
}

export function deviceItem(state: MemberNativeState): ComplianceItem {
  const d = state.device;
  if (!d.required) {
    return item({ key: 'device', title: 'Device security', status: 'not_required', detail: 'Device step is turned off' });
  }
  return item({
    key: 'device',
    title: 'Device security',
    status: d.compliant ? 'complete' : d.enrolled ? 'in_progress' : 'incomplete',
    detail: d.compliant ? `${d.name ?? 'Device'} passes all checks` : d.enrolled ? 'Enrolled, failing checks' : 'No device enrolled',
  });
}

export function backgroundCheckItem(state: MemberNativeState): ComplianceItem {
  const b = state.backgroundCheck;
  const title = 'Background check';
  if (b.completed) {
    return item({ key: 'background_check', title, status: 'complete', detail: 'Completed', completedAt: b.completedAt });
  }
  if (b.exempt) {
    return item({ key: 'background_check', title, status: 'not_required', detail: `Exempt${b.exemptReason ? `: ${b.exemptReason}` : ''}` });
  }
  if (!b.required) {
    return item({ key: 'background_check', title, status: 'not_required', detail: 'Not required for this member' });
  }
  const inFlight = b.status !== null && IN_FLIGHT_CHECKS.includes(b.status);
  return item({
    key: 'background_check',
    title,
    status: inFlight ? 'in_progress' : 'incomplete',
    detail: inFlight ? `Check ${b.status?.replace('_', ' ')}` : 'Not started',
  });
}

export function checklistItem({
  key,
  title,
  checklist,
}: {
  key: string;
  title: string;
  checklist: { totalItems: number; completedItems: number; overdueItems: number; items: { dueDate: Date | null; completed: boolean }[] };
}): ComplianceItem {
  const { totalItems, completedItems, overdueItems } = checklist;
  const nextDue = checklist.items
    .flatMap((i) => (!i.completed && i.dueDate ? [i.dueDate] : []))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return item({
    key,
    title,
    status:
      totalItems === 0
        ? 'not_required'
        : completedItems === totalItems
          ? 'complete'
          : overdueItems > 0
            ? 'overdue'
            : 'incomplete',
    detail: `${completedItems} of ${totalItems} items${overdueItems > 0 ? ` · ${overdueItems} overdue` : ''}`,
    completed: completedItems,
    total: totalItems,
    dueDate: nextDue ?? null,
  });
}

/** One status per person: overdue/expired beat incomplete, which beats in progress. */
export function overallStatus(items: ComplianceItem[]): ComplianceStatus {
  const required = items.filter((i) => i.status !== 'not_required');
  if (required.length === 0) return 'not_required';
  if (required.every((i) => i.status === 'complete')) return 'complete';
  if (required.some((i) => i.status === 'overdue')) return 'overdue';
  if (required.some((i) => i.status === 'expired')) return 'expired';
  if (required.some((i) => i.status === 'incomplete')) return 'incomplete';
  return 'in_progress';
}
