'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  downloadAcknowledgementsCsv,
  usePolicyAcknowledgements,
  type PolicyReminderResult,
} from '@/hooks/use-policy-lifecycle';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Section,
  Stack,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { Download, Email } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { AcknowledgementMemberList } from './AcknowledgementMemberList';

type Filter = 'all' | 'pending' | 'acknowledged';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Toast text for a reminder run, including who was skipped and why. */
export function reminderToastMessage(result: PolicyReminderResult): string {
  const parts = [
    result.sent > 0 ? `Reminder sent to ${plural(result.sent, 'employee')}` : 'No reminders sent',
  ];
  if (result.alreadyRemindedToday > 0) {
    parts.push(`${result.alreadyRemindedToday} already reminded today`);
  }
  if (result.unsubscribed > 0) parts.push(`${result.unsubscribed} unsubscribed`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return parts.join(' · ');
}

export function PolicyAcknowledgementsTab({ policyId }: { policyId: string }) {
  const { hasPermission } = usePermissions();
  const { acknowledgements, error, isLoading, mutate, sendReminder } = usePolicyAcknowledgements({
    policyId,
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [isReminding, setIsReminding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (error && !acknowledgements) {
    return (
      <Text size="sm" variant="destructive">
        Could not load acknowledgements. Refresh the page to try again.
      </Text>
    );
  }

  if (isLoading || !acknowledgements) {
    return (
      <Text size="sm" variant="muted">
        Loading acknowledgements…
      </Text>
    );
  }

  const { summary, members, history, currentVersion } = acknowledgements;
  const percent = summary.total === 0 ? 0 : Math.round((summary.acknowledged / summary.total) * 100);
  const visibleMembers = members.filter((m) => filter === 'all' || m.status === filter);
  const canRemind =
    hasPermission('policy', 'update') &&
    acknowledgements.inForce &&
    acknowledgements.isRequiredToSign &&
    summary.pending > 0;

  const handleRemind = async () => {
    setIsReminding(true);
    try {
      const result = await sendReminder();
      toast.success(reminderToastMessage(result));
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reminders');
    } finally {
      setIsReminding(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadAcknowledgementsCsv({ policyId });
    } catch {
      toast.error('Failed to export acknowledgements');
    } finally {
      setIsExporting(false);
    }
  };

  if (!acknowledgements.inForce) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No approved version yet</EmptyTitle>
          <EmptyDescription>
            Employees are asked to acknowledge this policy once a version has been approved and
            published. Submit it for approval from the Versions tab.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Stack gap="lg">
      <Section
        title="Employee acknowledgements"
        description={
          acknowledgements.isRequiredToSign
            ? `Who has read and accepted ${currentVersion ? `version ${currentVersion.version}` : 'this policy'}. Pending employees also get a weekly digest on Tuesdays.`
            : 'This policy is not set to require employee sign-off.'
        }
      >
        <Stack gap="md">
          {/* Actions sit under the heading so the header stacks on phones. */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" iconLeft={<Download size={14} />} loading={isExporting} onClick={handleExport} disabled={summary.total === 0}>
              Export CSV
            </Button>
            {canRemind && (
              <Button size="sm" iconLeft={<Email size={14} />} loading={isReminding} onClick={handleRemind}>
                Remind {summary.pending} pending
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Text size="sm" weight="medium">
                {summary.acknowledged} of {summary.total} acknowledged
              </Text>
              <Text size="sm" variant="muted">
                {percent}%
              </Text>
            </div>
            <Progress value={percent} aria-label="Acknowledgement progress" />
          </div>

          {members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No employees need to sign this policy</EmptyTitle>
                <EmptyDescription>
                  Employees with the compliance obligation who can see this policy will appear here
                  once it is published.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="-mx-1 overflow-x-auto px-1">
                <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                  <TabsList variant="underline">
                    <TabsTrigger value="all">All ({summary.total})</TabsTrigger>
                    <TabsTrigger value="pending">Pending ({summary.pending})</TabsTrigger>
                    <TabsTrigger value="acknowledged">
                      Acknowledged ({summary.acknowledged})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <AcknowledgementMemberList
                members={visibleMembers}
                currentVersion={currentVersion?.version ?? null}
              />
            </>
          )}
        </Stack>
      </Section>

      <Section
        title="Acknowledgement history"
        description="Every sign-off across all versions. Kept when a new version is published."
      >
        {history.length === 0 ? (
          <Text size="sm" variant="muted">
            No acknowledgements recorded yet.
          </Text>
        ) : (
          <ul className="divide-y rounded-md border">
            {history.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <Text size="sm">
                  {item.memberName}
                  {item.version ? ` signed v${item.version}` : ' signed'}
                </Text>
                <Text size="xs" variant="muted">
                  {format(new Date(item.acknowledgedAt), 'MMM d, yyyy HH:mm')}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Stack>
  );
}
