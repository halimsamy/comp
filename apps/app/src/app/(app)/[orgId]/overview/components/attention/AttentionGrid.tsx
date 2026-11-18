'use client';

import {
  type AttentionCard,
  type AttentionModule,
  useOverviewAttention,
} from '@/hooks/use-overview';
import { Button, Skeleton, Text } from '@trycompai/design-system';
import {
  CheckmarkFilled,
  ChevronRight,
  DocumentSigned,
  Education,
  ListChecked,
  Partnership,
  Plug,
  Policy,
  Report,
  UserAccess,
} from '@trycompai/design-system/icons';
import Link from 'next/link';
import type { ComponentType } from 'react';

const ICONS: Record<AttentionModule, ComponentType<{ size?: number; className?: string }>> = {
  tasks: ListChecked,
  policies: Policy,
  acknowledgements: DocumentSigned,
  training: Education,
  vendors: Partnership,
  checks: Plug,
  findings: Report,
  accessReviews: UserAccess,
};

const EMPTY_HINT: Record<AttentionModule, string> = {
  tasks: 'No evidence tasks yet. Add a framework to generate them.',
  policies: 'No policies yet. Generate or upload your policies.',
  acknowledgements: 'Publish policies that require sign-off to track acknowledgements.',
  training: 'Training completions appear here once people finish training.',
  vendors: 'Add the vendors you share data with to track reviews.',
  checks: 'Connect an integration to monitor controls automatically.',
  findings: 'No audit findings. Auditors raise them during an audit.',
  accessReviews: 'Run an access review at least every 6 months (PCI DSS 7.2.4).',
};

export function AttentionGrid({ organizationId }: { organizationId: string }) {
  const { cards, isLoading, hasError, mutate } = useOverviewAttention();

  if (isLoading && !cards) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[148px] rounded-md border border-border p-4">
            <Skeleton style={{ height: '100%', width: '100%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (hasError || !cards) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <Text size="sm" variant="muted">
          We couldn&apos;t load what needs attention.
        </Text>
        <Button size="sm" variant="outline" onClick={() => mutate()}>
          Try again
        </Button>
      </div>
    );
  }

  const totalAttention = cards.reduce((sum, card) => sum + card.needsAttention, 0);

  return (
    <section aria-labelledby="needs-attention-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="needs-attention-heading" className="text-base font-semibold text-foreground">
          Monitoring
        </h2>
        <Text size="xs" variant="muted">
          {totalAttention === 0
            ? 'Everything is on track'
            : `${totalAttention} items need attention`}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <AttentionCardLink key={card.module} card={card} organizationId={organizationId} />
        ))}
      </div>
    </section>
  );
}

function AttentionCardLink({
  card,
  organizationId,
}: {
  card: AttentionCard;
  organizationId: string;
}) {
  const Icon = ICONS[card.module];
  const isEmpty = card.total === 0 && card.needsAttention === 0;
  const okPercent = card.total > 0 ? Math.round((card.ok / card.total) * 100) : 0;

  return (
    <Link
      href={`/${organizationId}${card.href}`}
      className="group flex min-h-[148px] flex-col gap-3 rounded-md border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`attention-card-${card.module}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{card.label}</span>
        </div>
        <ChevronRight
          size={16}
          className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </div>

      {isEmpty ? (
        <Text size="xs" variant="muted">
          {EMPTY_HINT[card.module]}
        </Text>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            {card.needsAttention > 0 ? (
              <>
                <span className="text-2xl font-semibold tabular-nums text-destructive">
                  {card.needsAttention}
                </span>
                <span className="text-xs text-muted-foreground">
                  {card.needsAttention === 1 ? 'needs attention' : 'need attention'}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                <CheckmarkFilled size={16} />
                All OK
              </span>
            )}
          </div>
          {card.total > 0 && (
            <div className="flex flex-col gap-1">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${card.label}: ${card.ok} of ${card.total} OK`}
                aria-valuenow={okPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${okPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {card.ok} of {card.total} OK
              </span>
            </div>
          )}
          {card.reasons.length > 0 && (
            <ul className="mt-auto flex flex-wrap gap-x-3 gap-y-1">
              {card.reasons.slice(0, 3).map((reason) => (
                <li key={reason.label} className="text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{reason.count}</span>{' '}
                  {reason.label.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Link>
  );
}
