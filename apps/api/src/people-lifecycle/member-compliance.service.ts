import { Injectable } from '@nestjs/common';
import type { ChecklistKind } from '@db';
import { OffboardingChecklistService } from '../offboarding-checklist/offboarding-checklist.service';
import { decorateChecklist, isFormerMember } from './checklist-progress';
import { getMemberNativeState, type MemberNativeState } from './member-native-state';
import { buildOrgCompliance, summarize } from './org-compliance';

export type { ComplianceItem, ComplianceStatus } from './compliance-items';

/**
 * One people-compliance source (#3, #86, #87, #189): the member page, the
 * People table, reminders and the overview all read these items.
 */
@Injectable()
export class MemberComplianceService {
  constructor(private readonly checklistService: OffboardingChecklistService) {}

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
    const native = state ?? (await getMemberNativeState({ organizationId, memberId }));
    const checklist = await this.checklistService.getMemberChecklist(organizationId, memberId, kind);
    return decorateChecklist({ items: checklist.items, state: native, kind, now });
  }

  /** Vanta-style per-person checklist: one row per people-security obligation. */
  async getCompliance({ organizationId, memberId }: { organizationId: string; memberId: string }) {
    const now = new Date();
    const state = await getMemberNativeState({ organizationId, memberId });
    const former = isFormerMember(state.member, now);
    const onboarding = former
      ? null
      : await this.getChecklist({ organizationId, memberId, kind: 'onboarding', state, now });
    const offboarding = state.member.offboardDate
      ? await this.getChecklist({ organizationId, memberId, kind: 'offboarding', state, now })
      : null;
    return summarize({ state, onboarding, offboarding, former });
  }

  /** Every member's compliance in a fixed number of queries (People table, overview, reminders). */
  getOrgCompliance({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) {
    return buildOrgCompliance({ organizationId, now });
  }
}
