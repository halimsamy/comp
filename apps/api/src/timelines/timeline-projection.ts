const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProjectablePhase {
  name: string;
  orderIndex: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completionType: string;
  durationWeeks: number;
  datesPinned: boolean;
  startDate: Date | null;
  endDate: Date | null;
}

export interface AuditWindow {
  periodStart: Date;
  periodEnd: Date;
}

/** The phase the external audit happens in: named "audit"/"assessment", else the one before the final upload. */
export function findAuditPhaseIndex(phases: Pick<ProjectablePhase, 'name' | 'completionType'>[]): number {
  const named = phases.findIndex((p) => /audit|assessment/i.test(p.name));
  if (named >= 0) return named;
  const last = phases.length - 1;
  if (last >= 1 && phases[last].completionType === 'AUTO_UPLOAD') return last - 1;
  return -1;
}

/**
 * Display projection of a timeline (not persisted):
 * - an in-progress phase past its end date is overdue, and the pending
 *   phases after it are re-estimated from today;
 * - an audit engagement for the framework pins the audit phase to its
 *   period, and the phases after it follow it.
 * Pinned and completed phases keep their dates.
 */
export function projectPhases<T extends ProjectablePhase>({
  phases,
  now,
  audit,
}: {
  phases: T[];
  now: Date;
  audit?: AuditWindow | null;
}): (T & { isOverdue: boolean })[] {
  const sorted = [...phases].sort((a, b) => a.orderIndex - b.orderIndex);
  const auditIndex = audit ? findAuditPhaseIndex(sorted) : -1;
  let cursor: Date | null = null;

  return sorted.map((phase, index) => {
    const isOverdue =
      phase.status === 'IN_PROGRESS' && !!phase.endDate && phase.endDate.getTime() < now.getTime();
    if (index === auditIndex && audit && phase.status !== 'COMPLETED') {
      cursor = audit.periodEnd;
      return { ...phase, startDate: audit.periodStart, endDate: audit.periodEnd, isOverdue };
    }
    if (isOverdue) {
      cursor = now;
      return { ...phase, isOverdue };
    }
    if (phase.status === 'PENDING' && !phase.datesPinned && cursor) {
      const startDate: Date = cursor;
      const endDate = new Date(startDate.getTime() + phase.durationWeeks * WEEK_MS);
      cursor = endDate;
      return { ...phase, startDate, endDate, isOverdue };
    }
    if (cursor && phase.endDate) cursor = phase.endDate;
    return { ...phase, isOverdue };
  });
}
