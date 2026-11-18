import { HStack, Stack, Text } from '@trycompai/design-system';
import { CheckmarkOutline } from '@trycompai/design-system/icons';

/**
 * Shown when an automation moved a task to review (checks passed, no approver):
 * the task has a manual part only a person can finish.
 */
export function AutomationReviewBanner() {
  return (
    <div
      role="status"
      className="rounded-lg border border-l-4 border-border border-l-orange-400 bg-orange-50 p-4 dark:bg-orange-950/20"
    >
      <HStack gap="sm" align="start">
        <div className="mt-0.5 shrink-0 text-orange-500">
          <CheckmarkOutline size={20} />
        </div>
        <Stack gap="none">
          <Text size="sm" weight="medium">
            Automated checks passed — manual review needed
          </Text>
          <Text size="xs" variant="muted">
            The latest results are attached below. Add the manual evidence this task asks for,
            then mark it done.
          </Text>
        </Stack>
      </HStack>
    </div>
  );
}
