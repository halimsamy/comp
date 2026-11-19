'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Badge, Section, Stack, Text } from '@trycompai/design-system';
import { Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

export type TaskForm = {
  formType: string;
  title: string;
  status: 'ok' | 'due_soon' | 'overdue' | 'never_submitted' | 'not_relevant';
  lastSubmittedAt: string | null;
  nextDueAt: string | null;
  retiredTo: { label: string; path: string } | null;
  hasMatrix: boolean;
};

const STATUS: Record<TaskForm['status'], { label: string; variant: 'accent' | 'secondary' | 'destructive' | 'outline' }> = {
  ok: { label: 'Up to date', variant: 'accent' },
  due_soon: { label: 'Due soon', variant: 'outline' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  never_submitted: { label: 'Not submitted', variant: 'outline' },
  not_relevant: { label: 'Not relevant', variant: 'secondary' },
};

const linkClass =
  'inline-flex h-7 items-center gap-1 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted';
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const taskFormsKey = (taskId: string) => ['/v1/tasks/forms', taskId] as const;

/**
 * "Structured evidence for this task" (#173): the company forms this task's
 * controls ask for. Filling the form is the evidence; registers (matrix forms)
 * can be filled from a CSV. Retired forms point to the module that replaced them.
 */
export function TaskStructuredEvidence({ taskId }: { taskId: string }) {
  const { orgId } = useParams<{ orgId: string }>();
  const { hasPermission } = usePermissions();
  // Submitting a company form needs portal:update, like the Documents page.
  const canFill = hasPermission('portal', 'update');
  const { data: forms, error } = useSWR(taskFormsKey(taskId), async () => {
    const res = await apiClient.get<{ data: TaskForm[] }>(`/v1/tasks/${taskId}/forms`);
    if (res.error) throw new Error(res.error);
    return Array.isArray(res.data?.data) ? res.data.data : [];
  });

  if (error || !forms || forms.length === 0) return null;

  return (
    <Section
      title="Structured evidence for this task"
      description="Company forms that prove this task. Fill the form instead of uploading a document; the submission is the evidence."
    >
      <div className="divide-y divide-border rounded-lg border border-border">
        {forms.map((form) => {
          const status = STATUS[form.status];
          const fillHref = `/${orgId}/documents/${form.formType}/new?taskId=${taskId}`;
          return (
            <div
              key={form.formType}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <Stack gap="none">
                <div className="flex flex-wrap items-center gap-2">
                  <Text size="sm" weight="medium">
                    {form.title}
                  </Text>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <Text size="xs" variant="muted">
                  {form.retiredTo
                    ? `Now kept in ${form.retiredTo.label}`
                    : form.lastSubmittedAt
                      ? `Last submitted ${formatDate(form.lastSubmittedAt)}${form.nextDueAt ? ` · next due ${formatDate(form.nextDueAt)}` : ''}`
                      : 'No submission yet'}
                </Text>
              </Stack>
              <div className="flex flex-wrap gap-2">
                {form.retiredTo ? (
                  <Link href={`/${orgId}${form.retiredTo.path}`} className={linkClass}>
                    Open {form.retiredTo.label}
                    <Launch size={14} />
                  </Link>
                ) : (
                  <>
                    <Link href={`/${orgId}/documents/${form.formType}`} className={linkClass}>
                      View submissions
                    </Link>
                    {canFill && form.hasMatrix && (
                      <Link href={`${fillHref}&import=csv`} className={linkClass}>
                        Import CSV into rows
                      </Link>
                    )}
                    {canFill && (
                      <Link
                        href={fillHref}
                        className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Fill form
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
