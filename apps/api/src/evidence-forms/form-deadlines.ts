import { db } from '@db';
import {
  evidenceFormNextDueAt,
  toDbEvidenceFormType,
} from '@trycompai/company';
import { evidenceFormDefinitionList, type EvidenceFormType } from './evidence-forms.definitions';

/** A form is "due soon" this many days before its next due date. */
export const FORM_DUE_SOON_DAYS = 30;

export type FormDeadlineStatus = 'ok' | 'due_soon' | 'overdue' | 'never_submitted' | 'not_relevant';

export interface FormDeadline {
  formType: EvidenceFormType;
  title: string;
  category: string;
  hidden: boolean;
  optional: boolean;
  isNotRelevant: boolean;
  ownerMemberId: string | null;
  /** Effective cadence: the organization's override, else the form's default. */
  cadenceMonths: number;
  cadenceMonthsOverride: number | null;
  lastSubmittedAt: Date | null;
  nextDueAt: Date | null;
  isFresh: boolean;
  status: FormDeadlineStatus;
  /** Frameworks whose controls ask for this form. */
  frameworks: string[];
}

export function formDeadlineStatus({
  isNotRelevant,
  nextDueAt,
  now,
}: {
  isNotRelevant: boolean;
  nextDueAt: Date | null;
  now: Date;
}): FormDeadlineStatus {
  if (isNotRelevant) return 'not_relevant';
  if (!nextDueAt) return 'never_submitted';
  const left = nextDueAt.getTime() - now.getTime();
  if (left <= 0) return 'overdue';
  return left <= FORM_DUE_SOON_DAYS * 24 * 60 * 60 * 1000 ? 'due_soon' : 'ok';
}

/**
 * Every company form with its owner, cadence and next due date (#50, #136).
 * The Documents table and the overview deadline queue both read this.
 */
export async function listFormDeadlines(organizationId: string, now = new Date()): Promise<FormDeadline[]> {
  const [latest, settings, org, links, frameworkLinks] = await Promise.all([
    db.evidenceSubmission.groupBy({
      by: ['formType'],
      where: { organizationId, status: { not: 'rejected' } },
      _max: { submittedAt: true },
    }),
    db.evidenceFormSetting.findMany({
      where: { organizationId },
      select: { formType: true, isNotRelevant: true, ownerMemberId: true, cadenceMonthsOverride: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { accessRequestFormEnabled: true, whistleblowerReportEnabled: true },
    }),
    db.controlDocumentType.findMany({
      where: { control: { organizationId } },
      select: {
        formType: true,
        control: {
          select: {
            requirementsMapped: {
              select: {
                frameworkInstance: {
                  select: { framework: { select: { name: true } }, customFramework: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    }),
    // Links made on a framework page only exist framework-scoped.
    db.frameworkControlDocumentTypeLink.findMany({
      where: { frameworkInstance: { organizationId } },
      select: {
        formType: true,
        frameworkInstance: {
          select: { framework: { select: { name: true } }, customFramework: { select: { name: true } } },
        },
      },
    }),
  ]);
  const settingOf = new Map(settings.map((s) => [s.formType, s]));
  const lastOf = new Map(latest.map((r) => [r.formType, r._max.submittedAt]));
  const frameworksOf = new Map<string, Set<string>>();
  for (const link of links) {
    const names = frameworksOf.get(link.formType) ?? new Set<string>();
    for (const map of link.control.requirementsMapped) {
      const name = map.frameworkInstance.framework?.name ?? map.frameworkInstance.customFramework?.name;
      if (name) names.add(name);
    }
    frameworksOf.set(link.formType, names);
  }
  for (const link of frameworkLinks) {
    const names = frameworksOf.get(link.formType) ?? new Set<string>();
    const name = link.frameworkInstance.framework?.name ?? link.frameworkInstance.customFramework?.name;
    if (name) names.add(name);
    frameworksOf.set(link.formType, names);
  }
  // #203: a portal form switched off in People > Settings is not relevant.
  const switchedOff = new Set<string>([
    ...(org?.accessRequestFormEnabled === false ? ['access_request'] : []),
    ...(org?.whistleblowerReportEnabled === false ? ['whistleblower_report'] : []),
  ]);

  return evidenceFormDefinitionList.map((form) => {
    const dbType = toDbEvidenceFormType(form.type);
    const setting = settingOf.get(dbType);
    const lastSubmittedAt = lastOf.get(dbType) ?? null;
    const cadenceMonths = setting?.cadenceMonthsOverride ?? form.cadenceMonths;
    const nextDueAt = evidenceFormNextDueAt({ formType: form.type, lastSubmittedAt, cadenceMonths });
    const isNotRelevant = !!setting?.isNotRelevant || switchedOff.has(dbType);
    return {
      formType: form.type,
      title: form.title,
      category: form.category,
      hidden: !!form.hidden,
      optional: !!form.optional,
      isNotRelevant,
      ownerMemberId: setting?.ownerMemberId ?? null,
      cadenceMonths,
      cadenceMonthsOverride: setting?.cadenceMonthsOverride ?? null,
      lastSubmittedAt,
      nextDueAt,
      isFresh: !!nextDueAt && nextDueAt > now,
      status: formDeadlineStatus({ isNotRelevant, nextDueAt, now }),
      frameworks: [...(frameworksOf.get(dbType) ?? [])].sort(),
    };
  });
}
