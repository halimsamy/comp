'use client';

import { type FrameworkScores, type Tally } from '@/lib/control-compliance';
import {
  Card,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@trycompai/design-system';
import { Information } from '@trycompai/design-system/icons';
import Link from 'next/link';

export const EVIDENCE_PROGRESS_HELP =
  'Weighted by how much of each control’s evidence (policies, tasks, documents) is done, so partly finished controls count partly.';

export function ratio({ completed, total }: Tally) {
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
  href,
  help,
}: {
  label: string;
  value: string;
  detail?: string;
  percent: number;
  /** The tab (with filters) that lists what is behind the number. */
  href?: string;
  help?: string;
}) {
  const body = (
    <Card width="full" size="sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <Text size="xs" variant="muted">
            {label}
          </Text>
          {help ? (
            <Tooltip>
              <TooltipTrigger aria-label={`About ${label}`} onClick={(e) => e.preventDefault()}>
                <span className="flex text-muted-foreground hover:text-foreground">
                  <Information size={12} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{help}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
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
  if (!href) return body;
  return (
    <Link href={href} scroll={false} className="block rounded-lg transition-opacity hover:opacity-80">
      {body}
    </Link>
  );
}

/** Framework headline: controls OK, evidence progress, requirements and documents, each linking to its list. */
export function FrameworkProgress({
  scores,
  basePath,
}: {
  scores: FrameworkScores | null | undefined;
  /** Framework page path; cards link to `${basePath}?tab=…` with filters. */
  basePath?: string;
}) {
  if (!scores) return null;

  const controls = { completed: scores.controlsComplete, total: scores.controlsTotal };
  const requirements = { completed: scores.requirementsSatisfied, total: scores.requirementsTotal };
  const documents = {
    completed: scores.counts.documents.completed + scores.counts.ismsDocuments.completed,
    total: scores.counts.documents.total + scores.counts.ismsDocuments.total,
  };
  const work = {
    completed: scores.counts.policies.completed + scores.counts.tasks.completed,
    total: scores.counts.policies.total + scores.counts.tasks.total,
  };
  const notApplicable =
    scores.requirementsNotApplicable > 0
      ? `${scores.requirementsNotApplicable} not applicable, excluded`
      : 'All requirements in scope';
  const link = (query: string) => (basePath ? `${basePath}?${query}` : undefined);

  return (
    <TooltipProvider delay={150}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Controls OK"
          value={`${controls.completed}/${controls.total} (${ratio(controls)}%)`}
          detail="Controls with all their evidence done"
          percent={ratio(controls)}
          href={link('tab=controls&cstatus=incomplete')}
        />
        <StatCard
          label="Evidence progress"
          value={`${scores.complianceScore}%`}
          detail="Partial credit for partly done controls"
          percent={scores.complianceScore}
          help={EVIDENCE_PROGRESS_HELP}
          href={link('tab=controls')}
        />
        <StatCard
          label="Requirements satisfied"
          value={`${requirements.completed}/${requirements.total}`}
          detail={notApplicable}
          percent={ratio(requirements)}
          href={link('tab=requirements&rstatus=open')}
        />
        <StatCard
          label="Policies and tasks"
          value={`${work.completed}/${work.total}`}
          detail={`${scores.counts.policies.completed}/${scores.counts.policies.total} policies · ${scores.counts.tasks.completed}/${scores.counts.tasks.total} tasks`}
          percent={ratio(work)}
          href={link('tab=controls&cstatus=incomplete')}
        />
        <StatCard
          label="Documents"
          value={`${documents.completed}/${documents.total}`}
          detail={`${scores.counts.ismsDocuments.completed}/${scores.counts.ismsDocuments.total} ISMS documents published`}
          percent={ratio(documents)}
          href={link('tab=controls&cstatus=incomplete')}
        />
      </div>
    </TooltipProvider>
  );
}
