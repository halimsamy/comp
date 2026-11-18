'use client';

import type { VendorDocumentAiSummary } from '@/hooks/use-vendor-tpsp';
import { Badge } from '@trycompai/design-system';

const OPINION: Record<string, { label: string; variant: 'accent' | 'destructive' | 'secondary' }> =
  {
    unqualified: { label: 'Unqualified opinion', variant: 'accent' },
    qualified: { label: 'Qualified opinion', variant: 'destructive' },
    adverse: { label: 'Adverse opinion', variant: 'destructive' },
    disclaimer: { label: 'Disclaimer of opinion', variant: 'destructive' },
    compliant: { label: 'Compliant', variant: 'accent' },
    non_compliant: { label: 'Non-compliant', variant: 'destructive' },
    not_stated: { label: 'Opinion not stated', variant: 'secondary' },
  };

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </span>
      {items.length === 0 ? (
        <span className="text-sm text-muted-foreground">{empty}</span>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Reviewer-facing view of the AI summary of a SOC 2 / ISO / AOC / pentest report. */
export function VendorDocumentSummaryPanel({ summary }: { summary: VendorDocumentAiSummary }) {
  const opinion = OPINION[summary.opinion] ?? OPINION.not_stated;
  return (
    <div className="flex flex-col gap-4 rounded-md bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{summary.reportType}</span>
        <Badge variant={opinion.variant}>{opinion.label}</Badge>
        {summary.exceptions.length > 0 && (
          <Badge variant="destructive">
            {summary.exceptions.length} exception{summary.exceptions.length === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
      <p className="text-sm">{summary.summary}</p>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <span>
          <span className="text-muted-foreground">Auditor: </span>
          {summary.auditor ?? '—'}
        </span>
        <span>
          <span className="text-muted-foreground">Period: </span>
          {summary.periodStart ?? '?'} – {summary.periodEnd ?? '?'}
        </span>
        <span>
          <span className="text-muted-foreground">Scope: </span>
          {summary.scope}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListBlock
          title="Exceptions"
          items={summary.exceptions.map((e) => `${e.control}: ${e.description}`)}
          empty="No exceptions noted."
        />
        <ListBlock
          title="Complementary user entity controls"
          items={summary.complementaryUserEntityControls}
          empty="None listed."
        />
        <ListBlock
          title="Subservice organizations"
          items={summary.subserviceOrganizations}
          empty="None listed."
        />
        <ListBlock title="Follow up" items={summary.keyRisks} empty="Nothing flagged." />
      </div>
    </div>
  );
}
