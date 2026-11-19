import { db } from '@db';
import { toCsvRow } from '../../evidence-forms/evidence-forms-csv';
import {
  applicabilityDetailsSchema,
  type ApplicabilityDetails,
} from '../../frameworks/applicability/applicability-details';
import { applicabilityRules } from '../../frameworks/applicability/applicability-rules';
import { RequirementApplicabilityService } from '../../frameworks/applicability/requirement-applicability.service';
import type { RequirementFolder } from './framework-evidence-plan';

export type ApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'compensating_control'
  | 'customized_approach';

export type Applicability = {
  status: ApplicabilityStatus;
  justification: string | null;
  details: ApplicabilityDetails | null;
  /** Who set it: a member, the Statement of Applicability, or nobody (the default). */
  setBy: string;
  setAt: Date | null;
};

const STATUS_LABEL: Record<ApplicabilityStatus, string> = {
  applicable: 'Applicable',
  not_applicable: 'Not applicable',
  compensating_control: 'In place with compensating controls (PCI DSS Appendix B/C)',
  customized_approach: 'In place with the customized approach (PCI DSS Appendix D/E)',
};

export const statusLabel = (a: Applicability) => STATUS_LABEL[a.status];

/** Applicability records of a framework instance, keyed by requirement id. */
export async function loadApplicability({
  organizationId,
  frameworkInstanceId,
}: {
  organizationId: string;
  frameworkInstanceId: string;
}): Promise<{ byRequirement: Map<string, Applicability>; controlNames: Map<string, string> }> {
  const { data } = await new RequirementApplicabilityService().list({
    organizationId,
    frameworkInstanceId,
  });
  const byRequirement = new Map<string, Applicability>();
  for (const row of data) {
    const parsed = applicabilityDetailsSchema.safeParse(row.details);
    const user = row.updatedBy?.user;
    byRequirement.set(row.requirementKey, {
      status: row.status,
      justification: row.justification,
      details: parsed.success ? parsed.data : null,
      setBy: user
        ? user.name || user.email
        : row.source === 'soa'
          ? 'Statement of Applicability'
          : '',
      setAt: row.updatedAt,
    });
  }
  const controlIds = [...byRequirement.values()].flatMap((a) =>
    a.details?.kind === 'compensating_control' ? a.details.compensatingControlIds : [],
  );
  const controls = controlIds.length
    ? await db.control.findMany({
        where: { organizationId, id: { in: [...new Set(controlIds)] } },
        select: { id: true, name: true },
      })
    : [];
  return { byRequirement, controlNames: new Map(controls.map((c) => [c.id, c.name])) };
}

/**
 * The requirement's applicability, or the default when nobody decided: ISO
 * Annex A is "not yet decided" until the SoA answers it, everything else is
 * applicable.
 */
export function applicabilityFor({
  folder,
  frameworkName,
  byRequirement,
}: {
  folder: RequirementFolder;
  frameworkName: string;
  byRequirement: Map<string, Applicability>;
}): Applicability {
  const found = byRequirement.get(folder.requirement.id);
  if (found) return found;
  const rules = applicabilityRules({
    frameworkName,
    requirementIdentifier: folder.requirement.identifier,
  });
  return {
    status: 'applicable',
    justification:
      rules.managedBy === 'soa' ? 'Not yet decided in the Statement of Applicability' : null,
    details: null,
    setBy: '',
    setAt: null,
  };
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

/** applicability, justification, set_by, set_at columns (index.csv, summary). */
export function applicabilityColumns(a: Applicability): string[] {
  return [statusLabel(a), a.justification ?? '', a.setBy, day(a.setAt)];
}

export const APPLICABILITY_HEADERS = ['applicability', 'justification', 'set_by', 'set_at'];

/** The "Applicability:" block of a requirement's 00-requirement.txt. */
export function applicabilityBlock(a: Applicability): string[] {
  const lines = [
    'Applicability:',
    `  Status: ${statusLabel(a)}`,
    `  Justification: ${a.justification || '-'}`,
    `  Set by: ${a.setBy || '-'}${a.setAt ? ` on ${day(a.setAt)}` : ''}`,
  ];
  if (a.details?.kind === 'compensating_control') {
    lines.push('  Compensating controls worksheet: see "CCW - <requirement>.pdf" in this folder');
  }
  if (a.details?.kind === 'customized_approach') {
    lines.push('  Controls matrix: see "Customized approach - <requirement>.pdf" in this folder');
  }
  return [...lines, ''];
}

export function notApplicableText(a: Applicability): string {
  return [
    'This requirement is marked NOT APPLICABLE for this organization.',
    'No evidence is collected for it; the justification below is the evidence.',
    '',
    `Justification: ${a.justification || '-'}`,
    `Set by: ${a.setBy || '-'}`,
    `Set at: ${day(a.setAt) || '-'}`,
    '',
  ].join('\n');
}

/** Root "Applicability summary.csv": one row per requirement. */
export function buildApplicabilitySummaryCsv(
  rows: Array<{ folder: RequirementFolder; applicability: Applicability }>,
): string {
  return [
    toCsvRow(['requirement', 'name', ...APPLICABILITY_HEADERS]),
    ...rows.map(({ folder, applicability }) =>
      toCsvRow([
        folder.requirement.identifier,
        folder.requirement.name,
        ...applicabilityColumns(applicability),
      ]),
    ),
  ].join('\n');
}
