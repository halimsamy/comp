'use client';

import { useOnboardingChecklist, type ChecklistItem } from '@/hooks/use-onboarding-checklist';
import { usePermissions } from '@/hooks/use-permissions';
import { Button, Skeleton, Text } from '@trycompai/design-system';
import { CheckmarkFilled } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChecklistSectionCard } from './ChecklistSectionCard';
import { SetupMilestones } from './SetupMilestones';
import { SkipItemDialog } from './SkipItemDialog';

export function GettingStarted({ organizationId }: { organizationId: string }) {
  const { checklist, error, isLoading, mutate, skipItem, unskipItem } = useOnboardingChecklist();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('organization', 'update');
  const [skipping, setSkipping] = useState<ChecklistItem | null>(null);

  const handleSkip = async (reason: string) => {
    if (!skipping) return;
    try {
      await skipItem({ itemId: skipping.id, reason });
      toast.success('Step skipped');
    } catch (skipError) {
      toast.error(skipError instanceof Error ? skipError.message : 'Could not skip the step');
      throw skipError;
    }
  };

  const handleRestore = async (item: ChecklistItem) => {
    try {
      await unskipItem(item.id);
      toast.success('Step restored');
    } catch (restoreError) {
      toast.error(
        restoreError instanceof Error ? restoreError.message : 'Could not restore the step',
      );
    }
  };

  if (error && !checklist) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-border p-6">
        <Text size="sm">We couldn't load your setup checklist.</Text>
        <Button type="button" variant="outline" onClick={() => void mutate()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading || !checklist) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading setup checklist">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} style={{ height: 88 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        {checklist.isComplete && (
          <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/5 p-4">
            <CheckmarkFilled
              size={20}
              className="shrink-0 text-green-600 dark:text-green-400"
              aria-hidden
            />
            <Text size="sm">
              Setup is complete. Keep evidence fresh from the Evidence and Controls pages.
            </Text>
          </div>
        )}
        {checklist.sections.map((section, index) => (
          <ChecklistSectionCard
            key={section.id}
            section={section}
            index={index}
            organizationId={organizationId}
            canManage={canManage}
            onSkip={setSkipping}
            onRestore={(item) => void handleRestore(item)}
          />
        ))}
      </div>
      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-4">
          <SetupMilestones checklist={checklist} />
        </div>
      </div>
      <SkipItemDialog
        itemTitle={skipping?.title ?? ''}
        open={skipping !== null}
        onOpenChange={(open) => !open && setSkipping(null)}
        onSkip={handleSkip}
      />
    </div>
  );
}
