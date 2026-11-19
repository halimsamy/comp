import type { ApplicabilityStatus } from '@/lib/control-compliance';
import { z } from 'zod';

export interface ApplicabilityRules {
  editable: boolean;
  allowedStatuses: ApplicabilityStatus[];
  managedBy: 'soa' | null;
  reason: string | null;
}

/** Mirrors the API's zod union (apps/api/src/frameworks/applicability/applicability-details.ts). */
export type ApplicabilityDetails =
  | {
      kind: 'compensating_control';
      constraints: string;
      objective: string;
      identifiedRisk: string;
      compensatingControlIds: string[];
      validation: string;
      maintenance: string;
      revalidateAt: string;
    }
  | {
      kind: 'customized_approach';
      objective: string;
      matrix: { control: string; howMeetsObjective: string }[];
      targetedRiskAnalysisSubmissionId: string;
    }
  | { kind: 'not_applicable'; sourceRequirementId?: string };

export interface ApplicabilityRecord {
  id: string;
  status: ApplicabilityStatus;
  justification: string | null;
  details?: ApplicabilityDetails | null;
  source: 'manual' | 'soa';
  updatedAt: string;
  updatedBy: { id: string; user: { name: string | null; email: string } | null } | null;
}

export const APPLICABILITY_HELP: Record<ApplicabilityStatus, string> = {
  applicable: 'The requirement applies and is scored on its controls.',
  not_applicable: 'Out of scope. Excluded from scoring; auditors see the justification.',
  compensating_control:
    'Met by compensating controls (PCI DSS Appendix B/C). Still scored on its controls.',
  customized_approach:
    'Met through the customized approach (PCI DSS Appendix D). Still scored on its controls.',
};


/**
 * One flat form for every status (simpler with react-hook-form); the
 * per-status rules below match the API's discriminated union.
 */
export const applicabilityFormSchema = z
  .object({
    status: z.enum(['applicable', 'not_applicable', 'compensating_control', 'customized_approach']),
    justification: z.string().max(4000, 'Keep the justification under 4000 characters'),
    applyToChildren: z.boolean(),
    constraints: z.string().max(4000),
    objective: z.string().max(4000),
    identifiedRisk: z.string().max(4000),
    compensatingControlIds: z.array(z.string()).max(50),
    validation: z.string().max(4000),
    maintenance: z.string().max(4000),
    revalidateAt: z.string(),
    matrix: z.array(z.object({ control: z.string().max(500), howMeetsObjective: z.string().max(4000) })).max(50),
    targetedRiskAnalysisSubmissionId: z.string(),
  })
  .superRefine((v, ctx) => {
    const required = (path: string, value: string, message = 'Required') => {
      if (!value.trim()) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (v.status === 'applicable') return;
    required('justification', v.justification, 'Explain why, so the assessor can verify it');
    if (v.status === 'compensating_control') {
      for (const key of ['constraints', 'objective', 'identifiedRisk', 'validation', 'maintenance'] as const) {
        required(key, v[key]);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.revalidateAt)) {
        ctx.addIssue({ code: 'custom', path: ['revalidateAt'], message: 'Pick a date' });
      }
      if (v.compensatingControlIds.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['compensatingControlIds'], message: 'Pick at least one control' });
      }
    }
    if (v.status === 'customized_approach') {
      required('objective', v.objective);
      required('targetedRiskAnalysisSubmissionId', v.targetedRiskAnalysisSubmissionId, 'Link the targeted risk analysis');
      const rows = v.matrix.filter((row) => row.control.trim() || row.howMeetsObjective.trim());
      if (rows.length === 0 || rows.some((row) => !row.control.trim() || !row.howMeetsObjective.trim())) {
        ctx.addIssue({ code: 'custom', path: ['matrix'], message: 'Describe each control and how it meets the objective' });
      }
    }
  });

export type ApplicabilityForm = z.infer<typeof applicabilityFormSchema>;

/** CCW re-validation default: one year out (PCI DSS Appendix B: compensating controls are re-validated at least annually). */
export function oneYearFrom(now: Date): string {
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString().slice(0, 10);
}

export function toFormValues({
  status,
  record,
  now = new Date(),
}: {
  status: ApplicabilityStatus;
  record: ApplicabilityRecord | null;
  now?: Date;
}): ApplicabilityForm {
  const d = record?.details;
  const ccw = d?.kind === 'compensating_control' ? d : null;
  const custom = d?.kind === 'customized_approach' ? d : null;
  return {
    status,
    justification: record?.justification ?? '',
    applyToChildren: false,
    constraints: ccw?.constraints ?? '',
    objective: ccw?.objective ?? custom?.objective ?? '',
    identifiedRisk: ccw?.identifiedRisk ?? '',
    compensatingControlIds: ccw?.compensatingControlIds ?? [],
    validation: ccw?.validation ?? '',
    maintenance: ccw?.maintenance ?? '',
    revalidateAt: ccw?.revalidateAt?.slice(0, 10) ?? oneYearFrom(now),
    matrix: custom?.matrix ?? [{ control: '', howMeetsObjective: '' }],
    targetedRiskAnalysisSubmissionId: custom?.targetedRiskAnalysisSubmissionId ?? '',
  };
}

/** The PUT body. Applicable sends nothing else: the API clears the justification and worksheet. */
export function buildApplicabilityPayload(v: ApplicabilityForm) {
  if (v.status === 'applicable') return { status: v.status };
  const justification = v.justification.trim();
  if (v.status === 'not_applicable') {
    return { status: v.status, justification, ...(v.applyToChildren ? { applyToChildren: true } : {}) };
  }
  if (v.status === 'compensating_control') {
    const details: ApplicabilityDetails = {
      kind: 'compensating_control',
      constraints: v.constraints.trim(),
      objective: v.objective.trim(),
      identifiedRisk: v.identifiedRisk.trim(),
      compensatingControlIds: v.compensatingControlIds,
      validation: v.validation.trim(),
      maintenance: v.maintenance.trim(),
      revalidateAt: v.revalidateAt,
    };
    return { status: v.status, justification, details };
  }
  const details: ApplicabilityDetails = {
    kind: 'customized_approach',
    objective: v.objective.trim(),
    matrix: v.matrix
      .map((row) => ({ control: row.control.trim(), howMeetsObjective: row.howMeetsObjective.trim() }))
      .filter((row) => row.control && row.howMeetsObjective),
    targetedRiskAnalysisSubmissionId: v.targetedRiskAnalysisSubmissionId,
  };
  return { status: v.status, justification, details };
}
