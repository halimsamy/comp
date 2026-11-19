import { z } from 'zod';

export const TARGET_ROLES = ['employee', 'contractor', 'admin', 'owner'] as const;
/** Built-in departments; the dialog adds the custom ones members already use. */
export const TARGET_DEPARTMENTS = ['admin', 'gov', 'hr', 'it', 'itsm', 'qms'];

export const trainingModuleSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000),
  contentUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/.test(v), 'Enter a full URL starting with https://'),
  frameworkReference: z.string().trim().max(120),
  targetRoles: z.array(z.enum(TARGET_ROLES)),
  targetDepartments: z.array(z.string().trim().min(1).max(64)),
  recurrenceMonths: z.number().int().min(1, 'At least 1 month').max(60, 'At most 60 months'),
});

export type TrainingModuleForm = z.infer<typeof trainingModuleSchema>;

/** Drops empty optional strings so the API stores null-ish values instead of "". */
export function toTrainingModulePayload(values: TrainingModuleForm) {
  return {
    title: values.title,
    recurrenceMonths: values.recurrenceMonths,
    targetRoles: values.targetRoles,
    targetDepartments: values.targetDepartments,
    ...(values.description ? { description: values.description } : {}),
    ...(values.contentUrl ? { contentUrl: values.contentUrl } : {}),
    ...(values.frameworkReference ? { frameworkReference: values.frameworkReference } : {}),
  };
}
