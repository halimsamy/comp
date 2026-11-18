'use client';

import type { ChecklistItem } from '@/hooks/use-onboarding-checklist';
import { Badge, Button, Text } from '@trycompai/design-system';
import {
  ArrowRight,
  CheckmarkFilled,
  CircleDash,
  Locked,
  Undo,
} from '@trycompai/design-system/icons';
import Link from 'next/link';

const STATUS_ICON = {
  done: (
    <CheckmarkFilled size={20} className="text-green-600 dark:text-green-400" aria-label="Done" />
  ),
  skipped: <CheckmarkFilled size={20} className="text-muted-foreground" aria-label="Skipped" />,
  locked: <Locked size={20} className="text-muted-foreground" aria-label="Locked" />,
  todo: <CircleDash size={20} className="text-muted-foreground" aria-label="To do" />,
} as const;

export function ChecklistItemRow({
  item,
  organizationId,
  canManage,
  onSkip,
  onRestore,
}: {
  item: ChecklistItem;
  organizationId: string;
  canManage: boolean;
  onSkip: (item: ChecklistItem) => void;
  onRestore: (item: ChecklistItem) => void;
}) {
  const isOpen = item.status === 'todo';
  const showProgress = item.progress && item.progress.total > 0 && item.status !== 'done';

  return (
    <li
      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start"
      data-testid={`checklist-item-${item.id}`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="mt-0.5 shrink-0">{STATUS_ICON[item.status]}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <div
            className={
              item.status === 'done' || item.status === 'skipped'
                ? 'line-through decoration-muted-foreground/60'
                : ''
            }
          >
            <Text
              size="sm"
              weight="medium"
              variant={item.status === 'locked' ? 'muted' : 'default'}
            >
              {item.title}
            </Text>
          </div>
          <Text size="xs" variant="muted">
            {item.status === 'locked' && item.lockedReason ? item.lockedReason : item.description}
          </Text>
          {item.skip && (
            <Text size="xs" variant="muted">
              Skipped: {item.skip.reason}
            </Text>
          )}
          {(item.references.length > 0 || showProgress) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {showProgress && item.progress && (
                <Badge variant="secondary">
                  {item.progress.done} of {item.progress.total}
                </Badge>
              )}
              {item.references.map((reference) => (
                <Badge key={reference} variant="outline">
                  {reference}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 sm:pl-0">
        {item.status === 'skipped' && canManage && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            iconLeft={<Undo size={14} />}
            onClick={() => onRestore(item)}
          >
            Restore
          </Button>
        )}
        {isOpen && canManage && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onSkip(item)}>
            Skip
          </Button>
        )}
        {item.status !== 'locked' && item.status !== 'skipped' && (
          <Link href={`/${organizationId}${item.href}`}>
            <Button
              type="button"
              size="sm"
              variant={isOpen ? 'default' : 'outline'}
              iconRight={<ArrowRight size={14} />}
            >
              {item.status === 'done' ? 'View' : item.ctaLabel}
            </Button>
          </Link>
        )}
      </div>
    </li>
  );
}
