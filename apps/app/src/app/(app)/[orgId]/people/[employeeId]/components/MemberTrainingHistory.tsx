'use client';

import type { MemberTrainingModule, TrainingCycle } from '@/hooks/use-member-training';
import { useMemberTraining } from '@/hooks/use-member-training';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge, Button, Section, Stack, Text } from '@trycompai/design-system';
import { Add, Certificate, Launch } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { RecordTrainingDialog } from './RecordTrainingDialog';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const MODULE_STATUS: Record<MemberTrainingModule['status'], { label: string; variant: 'accent' | 'destructive' | 'outline' }> = {
  completed: { label: 'Completed', variant: 'accent' },
  expired: { label: 'Expired', variant: 'destructive' },
  not_started: { label: 'Not started', variant: 'outline' },
};

interface MemberTrainingHistoryProps {
  memberId: string;
}

/** Role-based training modules plus every completed cycle with its certificate. */
export function MemberTrainingHistory({ memberId }: MemberTrainingHistoryProps) {
  const { hasPermission } = usePermissions();
  // The record-completion endpoint requires training:update.
  const canEdit = hasPermission('training', 'update');
  const { cycles, modules, isLoading, recordCompletion, recordTraining, downloadCertificate } =
    useMemberTraining(memberId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const handleRecord = async (module: MemberTrainingModule) => {
    setBusyKey(module.id);
    try {
      await recordCompletion({ moduleId: module.id });
      toast.success(`${module.title} recorded as completed`);
    } catch {
      toast.error('Failed to record completion');
    } finally {
      setBusyKey(null);
    }
  };

  const handleCertificate = async (cycle: TrainingCycle) => {
    const key = `${cycle.moduleId}-${cycle.completedAt}`;
    setBusyKey(key);
    try {
      await downloadCertificate(cycle);
    } catch {
      toast.error('Failed to generate certificate');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Stack gap="6">
      {modules.length > 0 && (
        <Section
          title="Role-based training"
          description="Custom training assigned to this person's role or department, such as secure coding for developers."
        >
          <ul className="divide-y overflow-hidden rounded-lg border">
            {modules.map((module) => {
              const status = MODULE_STATUS[module.status];
              return (
                <li key={module.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{module.title}</span>
                      {module.frameworkReference && <Badge variant="outline">{module.frameworkReference}</Badge>}
                    </div>
                    <Text size="xs" variant="muted">
                      {module.completedAt && module.expiresAt
                        ? `Last completed ${formatDate(module.completedAt)} · ${module.status === 'expired' ? 'expired' : 'renews'} ${formatDate(module.expiresAt)}`
                        : `Renews every ${module.recurrenceMonths} months`}
                    </Text>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {module.contentUrl && (
                      <a href={module.contentUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${module.title}`}>
                        <Button variant="ghost" size="icon-xs">
                          <Launch size={14} />
                        </Button>
                      </a>
                    )}
                    {canEdit && module.status !== 'completed' && (
                      <Button size="sm" variant="outline" loading={busyKey === module.id} onClick={() => handleRecord(module)}>
                        Record completion
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section
        title="Training history"
        description="Every completed training cycle. Training is valid for 12 months, then it is assigned again."
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" iconLeft={<Add size={14} />} onClick={() => setRecordOpen(true)}>
              Record training
            </Button>
          ) : undefined
        }
      >
        {isLoading && <Text variant="muted">Loading history...</Text>}
        {!isLoading && cycles.length === 0 && (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center">
            <Text size="sm" variant="muted">
              No completed training cycles yet. They appear here once all videos of a training are watched.
            </Text>
          </div>
        )}
        {cycles.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {cycles.map((cycle) => {
              const key = `${cycle.moduleId}-${cycle.completedAt}`;
              return (
                <li key={key} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">{cycle.title}</span>
                    <Text size="xs" variant="muted">
                      Completed {formatDate(cycle.completedAt)} · {cycle.expired ? 'expired' : 'valid until'}{' '}
                      {formatDate(cycle.expiresAt)}
                    </Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={cycle.expired ? 'secondary' : 'accent'}>{cycle.expired ? 'Past cycle' : 'Current'}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={<Certificate size={14} />}
                      loading={busyKey === key}
                      onClick={() => handleCertificate(cycle)}
                    >
                      Certificate
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <RecordTrainingDialog open={recordOpen} onOpenChange={setRecordOpen} modules={modules} onRecord={recordTraining} />
    </Stack>
  );
}
