import {
  GENERAL_TRAINING_VIDEO_IDS,
  HIPAA_TRAINING_ID,
} from '@trycompai/company';

/** PCI DSS 12.6.3: security awareness training upon hire and at least once every 12 months. */
export const TRAINING_VALIDITY_MONTHS = 12;

export const GENERAL_TRAINING_MODULE_ID = 'general';

export function addMonths({ date, months }: { date: Date; months: number }): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export interface TrainingCompletionEntry {
  moduleId: string;
  completedAt: Date;
  expiresAt?: Date;
}

export interface TrainingCycle {
  moduleId: string;
  title: string;
  completedAt: Date;
  expiresAt: Date;
  expired: boolean;
}

function dedupe(entries: TrainingCompletionEntry[]): TrainingCompletionEntry[] {
  const seen = new Map<string, TrainingCompletionEntry>();
  for (const entry of entries) {
    const key = `${entry.moduleId}|${entry.completedAt.getTime()}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
  );
}

/**
 * Turns raw completions (history + current rows) into certificate-ready cycles.
 * General security awareness training is a cycle once every general video is
 * completed; it stays valid until its oldest video expires. HIPAA and custom
 * modules are one cycle per completion.
 */
export function computeTrainingCycles({
  entries,
  moduleTitles,
  now = new Date(),
}: {
  entries: TrainingCompletionEntry[];
  moduleTitles: Record<string, string>;
  now?: Date;
}): TrainingCycle[] {
  const sorted = dedupe(entries);
  const generalIds = new Set<string>(GENERAL_TRAINING_VIDEO_IDS);
  const cycles: TrainingCycle[] = [];
  let pending = new Map<string, Date>();

  for (const entry of sorted) {
    if (generalIds.has(entry.moduleId)) {
      pending.set(entry.moduleId, entry.completedAt);
      if (pending.size < generalIds.size) continue;
      const oldest = Math.min(...[...pending.values()].map((d) => d.getTime()));
      const expiresAt = addMonths({
        date: new Date(oldest),
        months: TRAINING_VALIDITY_MONTHS,
      });
      cycles.push({
        moduleId: GENERAL_TRAINING_MODULE_ID,
        title: 'Security Awareness Training',
        completedAt: entry.completedAt,
        expiresAt,
        expired: expiresAt <= now,
      });
      pending = new Map();
      continue;
    }

    const title =
      entry.moduleId === HIPAA_TRAINING_ID
        ? 'HIPAA Security Awareness Training'
        : moduleTitles[entry.moduleId];
    if (!title) continue;
    const expiresAt =
      entry.expiresAt ??
      addMonths({ date: entry.completedAt, months: TRAINING_VALIDITY_MONTHS });
    cycles.push({
      moduleId: entry.moduleId,
      title,
      completedAt: entry.completedAt,
      expiresAt,
      expired: expiresAt <= now,
    });
  }

  return cycles.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}
