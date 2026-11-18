'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  downloadAcknowledgementsCsv,
  usePolicyAcknowledgements,
  type PolicyAcknowledgementMember,
} from '@/hooks/use-policy-lifecycle';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Section,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { Download, Email } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

type Filter = 'all' | 'pending' | 'acknowledged';

const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : '—');

function memberDetail(member: PolicyAcknowledgementMember, currentVersion: number | null) {
  if (member.status === 'acknowledged') {
    return `${currentVersion ? `v${currentVersion} · ` : ''}${formatDate(member.acknowledgedAt)}`;
  }
  if (member.lastAcknowledgedVersion) {
    return `Last signed v${member.lastAcknowledgedVersion} on ${formatDate(member.lastAcknowledgedAt)}`;
  }
  return 'Never signed';
}

export function PolicyAcknowledgementsTab({ policyId }: { policyId: string }) {
  const { hasPermission } = usePermissions();
  const { acknowledgements, error, isLoading, sendReminder } = usePolicyAcknowledgements({
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
    acknowledgements.status === 'published' &&
    acknowledgements.isRequiredToSign &&
    summary.pending > 0;

  const handleRemind = async () => {
    setIsReminding(true);
    try {
      const result = await sendReminder();
      toast.success(
        result.sent === 1 ? 'Reminder sent to 1 employee' : `Reminders sent to ${result.sent} employees`,
      );
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

  return (
    <Stack gap="lg">
      <Section
        title="Employee acknowledgements"
        description={
          acknowledgements.isRequiredToSign
            ? `Who has read and accepted ${currentVersion ? `version ${currentVersion.version}` : 'this policy'}.`
            : 'This policy is not set to require employee sign-off.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" iconLeft={<Download size={14} />} loading={isExporting} onClick={handleExport} disabled={history.length === 0}>
              Export CSV
            </Button>
            {canRemind && (
              <Button size="sm" iconLeft={<Email size={14} />} loading={isReminding} onClick={handleRemind}>
                Remind {summary.pending} pending
              </Button>
            )}
          </div>
        }
      >
        <Stack gap="md">
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
              <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                <TabsList variant="underline">
                  <TabsTrigger value="all">All ({summary.total})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({summary.pending})</TabsTrigger>
                  <TabsTrigger value="acknowledged">Acknowledged ({summary.acknowledged})</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Version · date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMembers.map((member) => (
                      <TableRow key={member.memberId}>
                        <TableCell>
                          <div className="min-w-0">
                            <Text size="sm" weight="medium">{member.name}</Text>
                            <Text size="xs" variant="muted">{member.email}</Text>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.status === 'acknowledged' ? 'accent' : 'outline'}>
                            {member.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Text size="sm" variant="muted">
                            {memberDetail(member, currentVersion?.version ?? null)}
                          </Text>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
