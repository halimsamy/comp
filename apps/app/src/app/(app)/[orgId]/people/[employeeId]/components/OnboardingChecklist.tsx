'use client';

import { useOffboardingChecklist } from '@/hooks/use-offboarding-checklist';
import { Section, Stack, Text } from '@trycompai/design-system';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { EmploymentDocuments } from './EmploymentDocuments';
import { OffboardingChecklistItem } from './OffboardingChecklistItem';

interface OnboardingChecklistProps {
  memberId: string;
  canEdit: boolean;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function OnboardingChecklist({ memberId, canEdit }: OnboardingChecklistProps) {
  const { checklist, isLoading, completeItem, uncompleteItem, uploadEvidence, getDownloadUrl } =
    useOffboardingChecklist(memberId, 'onboarding');

  const handleComplete = useCallback(
    async ({ templateItemId, file }: { templateItemId: string; file?: File }) => {
      try {
        await completeItem({ templateItemId, file });
        toast.success('Item completed');
      } catch {
        toast.error('Failed to complete item');
      }
    },
    [completeItem],
  );

  const handleUncomplete = useCallback(
    async (templateItemId: string) => {
      try {
        await uncompleteItem(templateItemId);
        toast.success('Item reopened');
      } catch {
        toast.error('Failed to reopen item');
      }
    },
    [uncompleteItem],
  );

  const handleUploadEvidence = useCallback(
    async (templateItemId: string, file: File) => {
      try {
        await uploadEvidence(templateItemId, file);
        toast.success('Evidence uploaded');
      } catch {
        toast.error('Failed to upload evidence');
      }
    },
    [uploadEvidence],
  );

  const handleDownload = useCallback(
    async (attachmentId: string) => {
      try {
        const url = await getDownloadUrl(attachmentId);
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        toast.error('Failed to download file');
      }
    },
    [getDownloadUrl],
  );

  const total = checklist?.totalItems ?? 0;
  const done = checklist?.completedItems ?? 0;
  const overdue = checklist?.overdueItems ?? 0;
  const description = checklist?.startDate
    ? `Started ${formatDate(checklist.startDate)} · ${done} of ${total} done${overdue > 0 ? ` · ${overdue} overdue` : ''}`
    : 'Tasks every new hire completes. Items marked Automatic complete themselves.';

  return (
    <Stack gap="6">
      <Section title="Onboarding checklist" description={description}>
        {isLoading && <Text variant="muted">Loading checklist...</Text>}
        {!isLoading && total === 0 && (
          <Text variant="muted">
            No onboarding items configured. Add them in People settings.
          </Text>
        )}
        {total > 0 && (
          <Stack gap="4">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemax={total}
              aria-label="Onboarding progress"
            >
              <div
                className={`h-full transition-all ${overdue > 0 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <div className="flex flex-col gap-2">
              {checklist?.items.map((item) => (
                <OffboardingChecklistItem
                  key={item.templateItemId}
                  item={item}
                  memberId={memberId}
                  // Automatic items stay manually completable for state the platform can't see (e.g. Fleet-only devices).
                  canEdit={canEdit && !item.completedAutomatically}
                  onComplete={handleComplete}
                  onUncomplete={handleUncomplete}
                  onUploadEvidence={handleUploadEvidence}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          </Stack>
        )}
      </Section>
      <EmploymentDocuments memberId={memberId} eventType="onboard" canEdit={canEdit} />
    </Stack>
  );
}
