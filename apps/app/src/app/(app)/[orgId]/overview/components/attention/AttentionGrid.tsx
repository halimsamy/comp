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
  DataBase,
  Debug,
  Document,
  DocumentSigned,
  Education,
  ListChecked,
  Partnership,
  Plug,
  Policy,
  QuestionAnswering,
  Tools,
  UserAccess,
  UserMultiple,
  WarningAlt,
} from '@trycompai/design-system/icons';
import Link from 'next/link';
import type { ComponentType } from 'react';

const ICONS: Record<AttentionModule, ComponentType<{ size?: number; className?: string }>> = {
  tasks: ListChecked,
  policies: Policy,
  acknowledgements: DocumentSigned,
  training: Education,
  people: UserMultiple,
  vendors: Partnership,
  risks: WarningAlt,
  assets: DataBase,
  vulnerabilities: Debug,
  checks: Plug,
  correctiveActions: Tools,
  documents: Document,
  questionnaires: QuestionAnswering,
  accessReviews: UserAccess,
};

const EMPTY_HINT: Record<AttentionModule, string> = {
  tasks: 'No evidence tasks yet. Add a framework to generate them.',
  policies: 'No policies yet. Generate or upload your policies.',
  acknowledgements: 'Publish policies that require sign-off to track acknowledgements.',
  training: 'Invite your team to track security awareness training.',
  people: 'Invite your team to track policies, training and devices per person.',
  vendors: 'Add the vendors you share data with to track reviews.',
  risks: 'Add risks to your register, or generate them from the risk library.',
  assets: 'Connect a cloud provider or import your inventory to track assets.',
  vulnerabilities: 'No open vulnerabilities. Import a scan or connect a scanner.',
  checks: 'Connect an integration to monitor controls automatically.',
  correctiveActions: 'No nonconformities or audit findings are open.',
  documents: 'Complete the ISMS setup wizard to draft your ISO 27001 documents.',
  questionnaires: 'No questionnaire answers are waiting for review.',
  accessReviews: 'Run an access review at least every 6 months (PCI DSS 7.2.4).',
};

export function AttentionGrid({ organizationId }: { organizationId: string }) {
  const { cards, isLoading, hasError, mutate } = useOverviewAttention();

  if (isLoading && !cards) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {Array.from({ length: 12 }).map((_, i) => (
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

  // The title link stretches over the card; reason links sit above it (no nested anchors).
  return (
    <div
      className="group relative flex min-h-[148px] flex-col gap-3 rounded-md border border-border bg-card p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40"
      data-testid={`attention-card-${card.module}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/${organizationId}${card.href}`}
          className="flex min-w-0 items-center gap-2 after:absolute after:inset-0 after:rounded-md focus-visible:outline-none"
        >
          <Icon size={16} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{card.label}</span>
        </Link>
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
              {card.reasons.slice(0, 3).map((reason) => {
                const text = (
                  <>
                    <span className="font-medium tabular-nums text-foreground">{reason.count}</span>{' '}
                    {reason.label.toLowerCase()}
                  </>
                );
                return (
                  <li key={reason.label} className="text-xs text-muted-foreground">
                    {reason.href ? (
                      <Link
                        href={`/${organizationId}${reason.href}`}
                        className="relative z-10 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
