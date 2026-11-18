import { z } from 'zod';

/**
 * Canonical zod schema for an interested-party requirement (clauses 4.2b/c).
 * Shared by the add form (RequirementsForm) and the inline edit row
 * (RequirementsRow) so both validate identically against a single source of
 * truth.
 */
export const requirementSchema = z.object({
  partyName: z.string().trim().min(1, 'Interested party is required'),
  interestedPartyId: z.string().optional(),
  requirement: z.string().trim().min(1, 'Requirement is required'),
  treatment: z.string().trim().min(1, 'ISMS treatment is required'),
  // 4.2b: who keeps the obligation current and when it was last checked ('' = none).
  ownerMemberId: z.string().optional(),
  lastReviewedAt: z.string().optional(),
});

export type RequirementFormValues = z.infer<typeof requirementSchema>;
