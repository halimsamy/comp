import { z } from 'zod';
import type { IsmsNonconformityRow, NonconformityPayload } from '../hooks/useNonconformities';

export const NONCONFORMITY_SOURCES = [
  'incident',
  'external_audit',
  'management_review',
  'monitoring',
  'complaint',
  'other',
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  incident: 'Security incident',
  external_audit: 'External audit',
  management_review: 'Management review',
  monitoring: 'Monitoring (9.1)',
  complaint: 'Complaint',
  other: 'Other',
  internal_audit: 'Internal audit (9.2)',
};

export const NC_STATUSES = ['open', 'in_progress', 'closed'] as const;

export const NC_STATUS_LABELS: Record<(typeof NC_STATUSES)[number], string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

/** ISO 27001 10.2: retain the nature of the nonconformity, the action taken and its results. */
export const nonconformitySchema = z
  .object({
    source: z.enum(NONCONFORMITY_SOURCES),
    sourceRef: z.string(),
    description: z.string().trim().min(1, 'Describe what requirement was not met'),
    rootCause: z.string(),
    correctiveAction: z.string(),
    ownerMemberId: z.string(),
    dueDate: z.string(),
    status: z.enum(NC_STATUSES),
    closureEvidence: z.string(),
    effectivenessReviewedAt: z.string(),
    effectivenessReviewedById: z.string(),
    effectivenessNotes: z.string(),
  })
  .refine((values) => values.status !== 'closed' || values.correctiveAction.trim(), {
    path: ['correctiveAction'],
    message: 'Record the corrective action before closing',
  })
  .refine((values) => !values.effectivenessReviewedAt || values.effectivenessReviewedById, {
    path: ['effectivenessReviewedById'],
    message: 'Say who reviewed effectiveness',
  });

export type NonconformityFormValues = z.infer<typeof nonconformitySchema>;

const EMPTY: NonconformityFormValues = {
  source: 'incident',
  sourceRef: '',
  description: '',
  rootCause: '',
  correctiveAction: '',
  ownerMemberId: '',
  dueDate: '',
  status: 'open',
  closureEvidence: '',
  effectivenessReviewedAt: '',
  effectivenessReviewedById: '',
  effectivenessNotes: '',
};

const dateOnly = (value: string | null) => (value ? value.slice(0, 10) : '');

export function toFormValues(row: IsmsNonconformityRow | null): NonconformityFormValues {
  if (!row) return EMPTY;
  return {
    // An audit finding's source is fixed; the field is read-only for it.
    source: row.source === 'internal_audit' ? 'other' : row.source,
    sourceRef: row.sourceRef ?? '',
    description: row.description,
    rootCause: row.rootCause ?? '',
    correctiveAction: row.correctiveAction ?? '',
    ownerMemberId: row.ownerMemberId ?? '',
    dueDate: dateOnly(row.dueDate),
    status: row.status,
    closureEvidence: row.closureEvidence ?? '',
    effectivenessReviewedAt: dateOnly(row.effectivenessReviewedAt),
    effectivenessReviewedById: row.effectivenessReviewedById ?? '',
    effectivenessNotes: row.effectivenessNotes ?? '',
  };
}

/** Empty strings become null so the API clears the field. */
export function toPayload(values: NonconformityFormValues): NonconformityPayload {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim() ? value.trim() : null]),
  );
}
