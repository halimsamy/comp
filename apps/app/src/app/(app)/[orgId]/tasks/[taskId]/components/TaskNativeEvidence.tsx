'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { Badge, Button, HStack, Section, Stack, Text } from '@trycompai/design-system';
import { CheckmarkFilled, Launch, WarningAltFilled } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTaskNativeEvidence } from '../hooks/use-task-native-evidence';

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const SUBMIT_MESSAGES = {
  submitted: 'Snapshot attached. The task is now in review.',
  not_met: 'The rule is no longer met. Nothing was sent.',
  not_open: 'The task is already in review, done or not relevant.',
  unchanged: 'This evidence was already sent for review.',
} as const;

/**
 * "Auto-evidence from <module>": live status of the native-state rule that can
 * prove this task (ISMS, People, Access reviews, Vendors). Renders nothing for
 * tasks without a rule.
 */
export function TaskNativeEvidence({
  taskId,
  onTaskUpdated,
}: {
  taskId: string;
  onTaskUpdated?: () => void;
}) {
  const { orgId } = useParams<{ orgId: string }>();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('task', 'update');
  const { evidence, isLoading, error, isSubmitting, refresh, submit } = useTaskNativeEvidence({
    taskId,
  });

  if (isLoading) {
    return (
      <Section title="Auto-evidence">
        <Text size="sm" variant="muted">
          Checking platform records…
        </Text>
      </Section>
    );
  }

  if (error) {
    return (
      <Section
        title="Auto-evidence"
        actions={
          <Button size="sm" variant="outline" onClick={() => refresh()}>
            Retry
          </Button>
        }
      >
        <Text size="sm" variant="muted">
          Could not check the platform records for this task.
        </Text>
      </Section>
    );
  }

  if (!evidence) return null;

  const handleSubmit = async () => {
    try {
      const { outcome } = await submit();
      if (outcome === 'submitted') toast.success(SUBMIT_MESSAGES.submitted);
      else toast.info(SUBMIT_MESSAGES[outcome]);
      onTaskUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send for review');
    }
  };

  return (
    <Section
      title={`Auto-evidence from ${evidence.module}`}
      description="Comp AI checks this task against records you already keep and attaches a dated snapshot for review when the rule is met."
    >
      <div className="rounded-lg border border-border p-4">
        <Stack gap="md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <HStack gap="sm" align="start">
              <div
                className={`mt-0.5 shrink-0 ${evidence.holds ? 'text-emerald-600' : 'text-amber-500'}`}
              >
                {evidence.holds ? <CheckmarkFilled size={20} /> : <WarningAltFilled size={20} />}
              </div>
              <Stack gap="none">
                <Text size="sm" weight="medium">
                  {evidence.summary}
                </Text>
                <Text size="xs" variant="muted">
                  {evidence.title}
                </Text>
              </Stack>
            </HStack>
            <div className="shrink-0">
              <Badge variant={evidence.holds ? 'accent' : 'secondary'}>
                {evidence.holds ? 'Rule met' : 'Needs attention'}
              </Badge>
            </div>
          </div>

          {evidence.issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-9 text-sm text-muted-foreground">
              {evidence.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <Stack gap="none">
              <Text size="xs" variant="muted">
                {evidence.reference}
              </Text>
              <Text size="xs" variant="muted">
                Checked {formatDate(evidence.evaluatedAt)}
                {evidence.lastSubmittedAt
                  ? ` · Last sent for review ${formatDate(evidence.lastSubmittedAt)}`
                  : ''}
              </Text>
            </Stack>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${orgId}${evidence.path}`}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-3 text-[13px] font-medium hover:bg-muted"
              >
                Open {evidence.module}
                <Launch size={14} />
              </Link>
              {canUpdate && evidence.canSubmit && (
                <Button size="default" loading={isSubmitting} onClick={handleSubmit}>
                  Attach snapshot and send for review
                </Button>
              )}
            </div>
          </div>
        </Stack>
      </div>
    </Section>
  );
}
