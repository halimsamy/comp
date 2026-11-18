import type { AuditItemStatus } from '@db';

export type Readiness = 'ready' | 'needs_update' | 'not_ready' | 'not_applicable';

export type TaskEvidence = {
  id: string;
  title: string;
  status: string;
  /** Files valid at some point in the audit period. */
  filesInPeriod: number;
  /** Files whose validity has ended and nothing newer replaces them. */
  needsUpdate: boolean;
};

export type RequirementEvidence = {
  tasks: TaskEvidence[];
  policies: Array<{ id: string; name: string; status: string }>;
  documents: Array<{
    formType: string;
    slug: string | null;
    title: string;
    submissionsInPeriod: number;
  }>;
};

/**
 * Readiness of one requirement's evidence for the audit period: every linked
 * task done (or not relevant), every policy published, every document form
 * submitted in the period. An expired task file makes it "needs update".
 */
export function computeReadiness({
  applicable,
  evidence,
}: {
  applicable: boolean;
  evidence: RequirementEvidence;
}): Readiness {
  if (!applicable) return 'not_applicable';
  const { tasks, policies, documents } = evidence;
  if (tasks.length + policies.length + documents.length === 0) return 'not_ready';
  if (tasks.some((t) => t.needsUpdate)) return 'needs_update';
  const tasksOk = tasks.every((t) => t.status === 'done' || t.status === 'not_relevant');
  const policiesOk = policies.every((p) => p.status === 'published');
  const documentsOk = documents.every((d) => d.submissionsInPeriod > 0);
  return tasksOk && policiesOk && documentsOk ? 'ready' : 'not_ready';
}

/** A task needs an update when it has dated files and none is still valid. */
export function taskNeedsUpdate(
  files: Array<{ validUntil: Date | null; validFrom: Date | null }>,
  now: Date = new Date(),
): boolean {
  const dated = files.filter((f) => f.validFrom);
  if (dated.length === 0) return false;
  return dated.every((f) => !!f.validUntil && f.validUntil < now);
}

export type AuditProgress = {
  total: number;
  accepted: number;
  flagged: number;
  requested: number;
  notReviewed: number;
};

export function summarizeProgress({
  requirementIds,
  reviews,
}: {
  requirementIds: string[];
  reviews: Array<{ requirementId: string; status: AuditItemStatus }>;
}): AuditProgress {
  const inScope = new Set(requirementIds);
  const counts = { accepted: 0, flagged: 0, requested: 0 };
  for (const review of reviews) {
    if (inScope.has(review.requirementId)) counts[review.status]++;
  }
  const reviewed = counts.accepted + counts.flagged + counts.requested;
  return { total: inScope.size, ...counts, notReviewed: inScope.size - reviewed };
}
