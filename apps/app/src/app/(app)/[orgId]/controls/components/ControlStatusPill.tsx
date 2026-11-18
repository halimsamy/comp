import type { ControlEvidenceStatus, ControlOverview } from '@/hooks/use-controls-overview';
import { CheckmarkFilled, CircleDash, WarningAltFilled } from '@trycompai/design-system/icons';
import { STATUS_LABEL } from '../lib/controls-overview';

const STATUS_STYLE: Record<ControlEvidenceStatus, string> = {
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  not_started: 'bg-red-500/15 text-red-700 dark:text-red-300',
  no_evidence: 'bg-muted text-muted-foreground',
};

export function ControlStatusPill({ status }: { status: ControlEvidenceStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** "3/4" with a check when every piece of linked evidence is complete (Vanta "Tests 2/2"). */
export function EvidenceCount({ evidence }: { evidence: ControlOverview['evidence'] }) {
  const tallies = Object.values(evidence);
  const total = tallies.reduce((sum, t) => sum + t.total, 0);
  const completed = tallies.reduce((sum, t) => sum + t.completed, 0);
  const breakdown = [
    `Policies ${evidence.policies.completed}/${evidence.policies.total}`,
    `Tasks ${evidence.tasks.completed}/${evidence.tasks.total}`,
    `Forms ${evidence.forms.completed}/${evidence.forms.total}`,
    `ISMS documents ${evidence.ismsDocuments.completed}/${evidence.ismsDocuments.total}`,
  ].join(' · ');

  if (total === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
        <CircleDash size={16} aria-hidden />
        None
      </span>
    );
  }
  const done = completed === total;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm tabular-nums" title={breakdown}>
      {done ? (
        <CheckmarkFilled size={16} className="text-emerald-600" aria-hidden />
      ) : (
        <WarningAltFilled size={16} className="text-amber-500" aria-hidden />
      )}
      {completed}/{total}
    </span>
  );
}
