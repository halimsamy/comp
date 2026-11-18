'use client';

import type { EvidenceTally } from '@/hooks/use-controls-overview';
import { Card, Progress, Text } from '@trycompai/design-system';
import { percent, summarizeControls } from '../lib/controls-overview';

type Summary = ReturnType<typeof summarizeControls>;

function LegendRow({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function EvidenceRow({ label, tally }: { label: string; tally: EvidenceTally }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {tally.total === 0 ? 'None linked' : `${tally.completed}/${tally.total}`}
        </span>
      </div>
      <Progress value={percent(tally)} aria-label={`${label} complete`} />
    </div>
  );
}

/** Vanta-style "Assignment" and "Completion" cards above the controls list. */
export function ControlsSummary({ summary }: { summary: Summary }) {
  const assignedPct = percent({ completed: summary.assigned, total: summary.total });
  const okPct = percent({ completed: summary.completed, total: summary.total });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Assignment" description="Every control should have an accountable owner.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex flex-col">
            <span className="text-3xl font-semibold tabular-nums">{assignedPct}%</span>
            <Text size="sm" variant="muted">
              Assigned
            </Text>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <LegendRow label="Unassigned" value={summary.unassigned} dot="bg-muted-foreground/40" />
            <LegendRow label="Assigned" value={summary.assigned} dot="bg-primary" />
            <LegendRow
              label="Needs reassignment"
              value={summary.needsReassignment}
              dot="bg-orange-500"
            />
          </div>
        </div>
      </Card>
      <Card
        title="Completion"
        description="A control is OK when all of its linked evidence is complete."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Text size="sm" variant="muted">
              Controls OK
            </Text>
            <span className="text-3xl font-semibold tabular-nums">{okPct}%</span>
            <Progress value={okPct} aria-label="Controls OK" />
            <Text size="xs" variant="muted">
              {summary.completed} of {summary.total} controls
            </Text>
          </div>
          <div className="flex flex-col gap-3">
            <EvidenceRow label="Policies" tally={summary.evidence.policies} />
            <EvidenceRow label="Tasks" tally={summary.evidence.tasks} />
            <EvidenceRow label="Evidence forms" tally={summary.evidence.forms} />
            <EvidenceRow label="ISMS documents" tally={summary.evidence.ismsDocuments} />
          </div>
        </div>
      </Card>
    </div>
  );
}
