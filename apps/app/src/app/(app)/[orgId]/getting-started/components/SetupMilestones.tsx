'use client';

import type { OnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import { Progress, Text } from '@trycompai/design-system';
import { CheckmarkFilled, CircleDash } from '@trycompai/design-system/icons';
import { getMilestones } from './milestones';

/** Right-hand summary: overall progress plus the outcomes that unblock an audit. */
export function SetupMilestones({ checklist }: { checklist: OnboardingChecklist }) {
  const milestones = getMilestones(checklist);

  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border p-4">
        <div className="flex items-baseline justify-between gap-2">
          <Text size="sm" weight="medium">
            Setup progress
          </Text>
          <Text size="sm" variant="muted">
            {checklist.percent}%
          </Text>
        </div>
        <Progress value={checklist.percent} aria-label="Setup progress" />
        <Text size="xs" variant="muted">
          {checklist.completed} of {checklist.total} steps complete
        </Text>
      </div>
      <ul className="flex flex-col gap-3 p-4">
        {milestones.map((milestone) => {
          const done = milestone.done === milestone.total;
          return (
            <li key={milestone.id} className="flex items-center gap-3">
              {done ? (
                <CheckmarkFilled
                  size={20}
                  className="shrink-0 text-green-600 dark:text-green-400"
                  aria-hidden
                />
              ) : (
                <CircleDash size={20} className="shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex flex-col">
                <Text size="sm" weight="medium">
                  {milestone.done} of {milestone.total}
                </Text>
                <Text size="xs" variant="muted">
                  {milestone.label}
                </Text>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
