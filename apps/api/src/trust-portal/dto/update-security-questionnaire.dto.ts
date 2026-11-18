import { z } from 'zod';

export const UpdateSecurityQuestionnaireSchema = z
  .object({
    enabled: z.boolean().optional(),
    // Hold AI answers for admin approval before they are emailed to the visitor
    requiresReview: z.boolean().optional(),
  })
  .refine((b) => b.enabled !== undefined || b.requiresReview !== undefined, {
    message: 'Provide enabled or requiresReview',
  });

export type UpdateSecurityQuestionnaireDto = z.infer<
  typeof UpdateSecurityQuestionnaireSchema
>;
