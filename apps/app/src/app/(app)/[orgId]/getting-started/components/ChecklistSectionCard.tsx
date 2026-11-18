'use client';

import type { ChecklistItem, ChecklistSection } from '@/hooks/use-onboarding-checklist';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Text,
} from '@trycompai/design-system';
import { CheckmarkFilled, ChevronDown } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { ChecklistItemRow } from './ChecklistItemRow';

export function ChecklistSectionCard({
  section,
  index,
  organizationId,
  canManage,
  onSkip,
  onRestore,
}: {
  section: ChecklistSection;
  index: number;
  organizationId: string;
  canManage: boolean;
  onSkip: (item: ChecklistItem) => void;
  onRestore: (item: ChecklistItem) => void;
}) {
  const isComplete = section.completed === section.total;
  // Finished sections start collapsed, like Vanta's Starter Guide.
  const [open, setOpen] = useState(!isComplete);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-card shadow-sm">
        <CollapsibleTrigger
          aria-label={`${section.title}, ${section.completed} of ${section.total} complete`}
          className="flex w-full cursor-pointer items-start gap-3 p-4 text-left"
        >
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
              isComplete
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-primary/10 text-primary'
            }`}
          >
            {isComplete ? <CheckmarkFilled size={16} /> : index + 1}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text as="span" size="base" weight="medium">
              {section.title}
            </Text>
            <Text as="span" size="sm" variant="muted">
              {section.description}
            </Text>
          </span>
          <span className="flex shrink-0 items-center gap-2 pt-1">
            <Text as="span" size="xs" variant="muted">
              <span className="sm:hidden">
                {section.completed}/{section.total}
              </span>
              <span className="hidden sm:inline">
                {section.completed} of {section.total} complete
              </span>
            </Text>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="divide-y divide-border border-t border-border px-4">
            {section.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                organizationId={organizationId}
                canManage={canManage}
                onSkip={onSkip}
                onRestore={onRestore}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
