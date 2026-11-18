'use client';

import { type FrameworkScores, type Tally } from '@/lib/control-compliance';
import { Card, Text } from '@trycompai/design-system';

function ratio({ completed, total }: Tally) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/50">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  percent,
}: {
  label: string;
  value: string;
  detail?: string;
  percent: number;
}) {
  return (
    <Card width="full" size="sm">
      <div className="flex flex-col gap-2">
        <Text size="xs" variant="muted">
          {label}
        </Text>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <Bar percent={percent} />
        {detail ? (
          <Text size="xs" variant="muted">
            {detail}
          </Text>
        ) : null}
      </div>
    </Card>
  );
}

/** Framework completion from the API score: %, N/M controls, requirements and evidence. */
export function FrameworkProgress({ scores }: { scores: FrameworkScores | null | undefined }) {
  if (!scores) return null;

  const controls = { completed: scores.controlsComplete, total: scores.controlsTotal };
  const requirements = { completed: scores.requirementsSatisfied, total: scores.requirementsTotal };
  const documents = {
    completed: scores.counts.documents.completed + scores.counts.ismsDocuments.completed,
    total: scores.counts.documents.total + scores.counts.ismsDocuments.total,
  };
  const notApplicable =
    scores.requirementsNotApplicable > 0
      ? `${scores.requirementsNotApplicable} not applicable, excluded`
      : 'All requirements in scope';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Completion"
        value={`${scores.complianceScore}%`}
        detail={`${controls.completed}/${controls.total} controls complete`}
        percent={scores.complianceScore}
      />
      <StatCard
        label="Requirements satisfied"
        value={`${requirements.completed}/${requirements.total}`}
        detail={notApplicable}
        percent={ratio(requirements)}
      />
      <StatCard
        label="Policies and tasks"
        value={`${scores.counts.policies.completed + scores.counts.tasks.completed}/${
          scores.counts.policies.total + scores.counts.tasks.total
        }`}
        detail={`${scores.counts.policies.completed}/${scores.counts.policies.total} policies · ${scores.counts.tasks.completed}/${scores.counts.tasks.total} tasks`}
        percent={ratio({
          completed: scores.counts.policies.completed + scores.counts.tasks.completed,
          total: scores.counts.policies.total + scores.counts.tasks.total,
        })}
      />
      <StatCard
        label="Documents"
        value={`${documents.completed}/${documents.total}`}
        detail={`${scores.counts.ismsDocuments.completed}/${scores.counts.ismsDocuments.total} ISMS documents published`}
        percent={ratio(documents)}
      />
    </div>
  );
}
