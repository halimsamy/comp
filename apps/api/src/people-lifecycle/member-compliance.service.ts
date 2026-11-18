import { Injectable } from '@nestjs/common';
import type { ChecklistKind } from '@db';
import { OffboardingChecklistService } from '../offboarding-checklist/offboarding-checklist.service';
import { addMonths, TRAINING_VALIDITY_MONTHS } from '../training/training-cycles';
import { TrainingModulesService } from '../training/training-modules.service';
import {
  autoCompletion,
  getMemberNativeState,
  type MemberNativeState,
} from './member-native-state';

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
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IN_FLIGHT_CHECKS = ['invited', 'in_progress', 'in_review'];

@Injectable()
export class MemberComplianceService {
  constructor(
    private readonly checklistService: OffboardingChecklistService,
    private readonly trainingModulesService: TrainingModulesService,
  ) {}

  private loadState({ organizationId, memberId }: { organizationId: string; memberId: string }) {
    return getMemberNativeState({
      organizationId,
      memberId,
      trainingModulesService: this.trainingModulesService,
    });
  }

  /** Onboarding or offboarding checklist with SLA due dates and items completed from native state. */
  async getChecklist({
    organizationId,
    memberId,
    kind,
    state,
    now = new Date(),
  }: {
    organizationId: string;
    memberId: string;
    kind: ChecklistKind;
    state?: MemberNativeState;
    now?: Date;
  }) {
    const native = state ?? (await this.loadState({ organizationId, memberId }));
    const checklist = await this.checklistService.getMemberChecklist(organizationId, memberId, kind);
    const startDate =
      kind === 'onboarding'
        ? (native.member.onboardDate ?? native.member.createdAt)
        : native.member.offboardDate;

    const items = checklist.items.map((item) => {
      const auto = item.autoCompleteSource
        ? autoCompletion({ state: native, source: item.autoCompleteSource })
        : null;
      const completed = item.completed || !!auto?.done;
      const dueDate =
        item.dueDays !== null && startDate
          ? new Date(startDate.getTime() + item.dueDays * DAY_MS)
          : null;
      return {
        ...item,
        completed,
        completedAutomatically: !item.completed && !!auto?.done,
        completedAt: item.completion?.completedAt ?? auto?.completedAt ?? null,
        dueDate,
        // Due by the end of the due day.
        overdue: !completed && dueDate !== null && dueDate.getTime() + DAY_MS <= now.getTime(),
      };
    });

    return {
      kind,
      startDate,
      items,
      totalItems: items.length,
      completedItems: items.filter((i) => i.completed).length,
      overdueItems: items.filter((i) => i.overdue).length,
    };
  }

  /** Vanta-style per-person checklist: one row per people-security obligation. */
  async getCompliance({ organizationId, memberId }: { organizationId: string; memberId: string }) {
    const state = await this.loadState({ organizationId, memberId });
    const onboarding = await this.getChecklist({ organizationId, memberId, kind: 'onboarding', state });
    const offboarding = state.member.offboardDate
      ? await this.getChecklist({ organizationId, memberId, kind: 'offboarding', state })
      : null;

    const items: ComplianceItem[] = [
      policiesItem(state),
      trainingItem(state),
      ...(state.training.modules.length > 0 ? [roleTrainingItem(state)] : []),
      deviceItem(state),
      backgroundCheckItem(state),
      checklistItem({ key: 'onboarding', title: 'Onboarding checklist', checklist: onboarding }),
      ...(offboarding
        ? [checklistItem({ key: 'offboarding', title: 'Offboarding checklist', checklist: offboarding })]
        : []),
    ];
    const required = items.filter((i) => i.status !== 'not_required');

    return {
      member: {
        id: state.member.id,
        name: state.member.user.name,
        email: state.member.user.email,
        role: state.member.role,
        department: state.member.department,
        joinedAt: state.member.createdAt,
        onboardDate: state.member.onboardDate,
        offboardDate: state.member.offboardDate,
        deactivated: state.member.deactivated,
      },
      items,
      completedItems: required.filter((i) => i.status === 'complete').length,
      totalItems: required.length,
    };
  }
}

function item(fields: Partial<ComplianceItem> & Pick<ComplianceItem, 'key' | 'title' | 'status' | 'detail'>): ComplianceItem {
  return { completedAt: null, dueDate: null, expiresAt: null, ...fields };
}

function policiesItem(state: MemberNativeState): ComplianceItem {
  const { required, accepted } = state.policies;
  return item({
    key: 'policies',
    title: 'Accept security policies',
    status: required === 0 ? 'not_required' : accepted === required ? 'complete' : 'incomplete',
    detail: required === 0 ? 'No policies require a signature' : `${accepted} of ${required} accepted`,
  });
}

function trainingItem(state: MemberNativeState): ComplianceItem {
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
  });
}

function roleTrainingItem(state: MemberNativeState): ComplianceItem {
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
    expiresAt: status === 'complete' && expiries.length > 0 ? new Date(Math.min(...expiries)) : null,
  });
}

function deviceItem(state: MemberNativeState): ComplianceItem {
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

function backgroundCheckItem(state: MemberNativeState): ComplianceItem {
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

function checklistItem({
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
    dueDate: nextDue ?? null,
  });
}
