import type { Audit, AuditPayload } from '@/hooks/use-audits';
import { z } from 'zod';
import { toDay } from './audit-labels';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const auditSchema = z
  .object({
    frameworkInstanceId: z.string().min(1, 'Pick a framework'),
    title: z.string().trim().min(1, 'Name the audit').max(200),
    firmName: z.string().trim().max(200),
    status: z.enum(['planned', 'in_progress', 'awaiting_report', 'completed']),
    periodStart: day,
    periodEnd: day,
    accessEndsAt: z.union([day, z.literal('')]),
    auditorMemberIds: z.array(z.string()),
    pendingAuditorEmails: z.array(z.string().email()),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: 'The audit period must start before it ends',
    path: ['periodEnd'],
  });

export type AuditFormValues = z.infer<typeof auditSchema>;

export function toAuditFormValues(audit: Audit | null): AuditFormValues {
  return {
    frameworkInstanceId: audit?.frameworkInstanceId ?? '',
    title: audit?.title ?? '',
    firmName: audit?.firmName ?? '',
    status: audit?.status ?? 'planned',
    periodStart: toDay(audit?.periodStart ?? null),
    periodEnd: toDay(audit?.periodEnd ?? null),
    accessEndsAt: toDay(audit?.accessEndsAt ?? null),
    auditorMemberIds: audit?.auditors.map((a) => a.memberId) ?? [],
    pendingAuditorEmails: audit?.pendingAuditorEmails ?? [],
  };
}

export function toAuditPayload({
  values,
  audit,
}: {
  values: AuditFormValues;
  audit: Audit | null;
}): AuditPayload {
  const shared = {
    title: values.title,
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    auditorMemberIds: values.auditorMemberIds,
    pendingAuditorEmails: values.pendingAuditorEmails,
  };
  if (!audit) {
    return {
      ...shared,
      frameworkInstanceId: values.frameworkInstanceId,
      ...(values.firmName ? { firmName: values.firmName } : {}),
      ...(values.accessEndsAt ? { accessEndsAt: values.accessEndsAt } : {}),
    };
  }
  return {
    ...shared,
    status: values.status,
    firmName: values.firmName || null,
    accessEndsAt: values.accessEndsAt || null,
  };
}
