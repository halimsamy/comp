import type { ApplicabilityStatus } from '@/lib/control-compliance';
import { z } from 'zod';

export interface ApplicabilityRules {
  editable: boolean;
  allowedStatuses: ApplicabilityStatus[];
  managedBy: 'soa' | null;
  reason: string | null;
}

export interface ApplicabilityRecord {
  id: string;
  status: ApplicabilityStatus;
  justification: string | null;
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

export const applicabilityFormSchema = z
  .object({
    status: z.enum(['applicable', 'not_applicable', 'compensating_control', 'customized_approach']),
    justification: z.string().max(4000, 'Keep the justification under 4000 characters'),
  })
  .refine((v) => v.status === 'applicable' || v.justification.trim().length > 0, {
    path: ['justification'],
    message: 'Explain why, so the assessor can verify it',
  });

export type ApplicabilityForm = z.infer<typeof applicabilityFormSchema>;
