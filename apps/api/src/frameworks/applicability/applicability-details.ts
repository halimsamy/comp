import { z } from 'zod';

const text = (max = 4000) => z.string().trim().min(1, 'Required').max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use a YYYY-MM-DD date');

/** PCI DSS Appendix C: Compensating Controls Worksheet (CCW). */
export const compensatingDetailsSchema = z.object({
  kind: z.literal('compensating_control'),
  constraints: text(),
  objective: text(),
  identifiedRisk: text(),
  compensatingControlIds: z.array(z.string().min(1)).min(1, 'Pick at least one control').max(50),
  validation: text(),
  maintenance: text(),
  revalidateAt: isoDate,
});

/** PCI DSS Appendix E: customized approach controls matrix plus its targeted risk analysis (12.3.2). */
export const customizedDetailsSchema = z.object({
  kind: z.literal('customized_approach'),
  objective: text(),
  matrix: z
    .array(z.object({ control: text(500), howMeetsObjective: text() }))
    .min(1, 'Add at least one control')
    .max(50),
  targetedRiskAnalysisSubmissionId: z.string().min(1, 'Link the targeted risk analysis'),
});

/** Not applicable, optionally cascaded from a parent requirement. */
export const notApplicableDetailsSchema = z.object({
  kind: z.literal('not_applicable'),
  sourceRequirementId: z.string().min(1).optional(),
});

export const applicabilityDetailsSchema = z.discriminatedUnion('kind', [
  compensatingDetailsSchema,
  customizedDetailsSchema,
  notApplicableDetailsSchema,
]);

export type ApplicabilityDetails = z.infer<typeof applicabilityDetailsSchema>;

/**
 * PCI DSS v4.0.1 requirements with no Customized Approach Objective ("This
 * requirement is not eligible for the customized approach"), plus all of
 * Appendices A2 and A3.
 */
const NOT_ELIGIBLE_FOR_CUSTOMIZED = new Set(['3.3.1', '3.3.1.1', '3.3.1.2', '3.3.1.3', '3.3.2', '11.3.2']);

export function isCustomizedApproachEligible(identifier: string | null | undefined): boolean {
  const id = (identifier ?? '').trim();
  if (/^A[23]\./.test(id)) return false;
  return !NOT_ELIGIBLE_FOR_CUSTOMIZED.has(id);
}

/**
 * Checks that `details` matches the status. Compensating and customized need
 * their worksheet; applicable stores nothing; not applicable stores only the
 * cascade source. Throws a readable message on failure.
 */
export function parseApplicabilityDetails({
  status,
  details,
}: {
  status: 'applicable' | 'not_applicable' | 'compensating_control' | 'customized_approach';
  details: unknown;
}): ApplicabilityDetails | null {
  if (status === 'applicable') return null;
  if (status === 'not_applicable' && (details === undefined || details === null)) return null;
  const parsed = applicabilityDetailsSchema.safeParse(details);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new Error(`Invalid ${status} details. ${where}${issue?.message ?? 'Invalid input'}`);
  }
  if (parsed.data.kind !== status) {
    throw new Error(`Details are for ${parsed.data.kind}, not ${status}`);
  }
  return parsed.data;
}
