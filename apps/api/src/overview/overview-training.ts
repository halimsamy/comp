import { HIPAA_TRAINING_ID } from '@trycompai/company';
import type { OverviewData } from './overview-data';

export interface TrainingEntry {
  memberId: string;
  title: string;
  expiresAt: Date;
}

/**
 * Current training cycle per member and course. Only the newest completion of
 * each course counts (an older, expired one is superseded by a renewal). The
 * five built-in security awareness videos count as one course that expires with
 * its earliest video. Disabled custom modules are ignored.
 */
export function latestTraining({
  data,
}: {
  data: OverviewData;
}): TrainingEntry[] {
  const activeMembers = new Set(data.members.map((m) => m.id));
  const modules = new Map(data.trainingModules.map((m) => [m.id, m]));

  const latestPerVideo = new Map<
    string,
    { memberId: string; moduleId: string; expiresAt: Date }
  >();
  for (const record of data.trainingRecords) {
    if (!activeMembers.has(record.memberId)) continue;
    const key = `${record.memberId}:${record.moduleId}`;
    const current = latestPerVideo.get(key);
    if (!current || current.expiresAt < record.expiresAt)
      latestPerVideo.set(key, record);
  }

  const courses = new Map<string, TrainingEntry>();
  for (const record of latestPerVideo.values()) {
    const module = modules.get(record.moduleId);
    if (module && !module.isEnabled) continue;
    const courseId = module
      ? module.id
      : record.moduleId === HIPAA_TRAINING_ID
        ? 'hipaa'
        : 'security-awareness';
    const title = module
      ? module.title
      : courseId === 'hipaa'
        ? 'HIPAA training'
        : 'Security awareness training';
    const key = `${record.memberId}:${courseId}`;
    const current = courses.get(key);
    if (!current || record.expiresAt < current.expiresAt) {
      courses.set(key, {
        memberId: record.memberId,
        title,
        expiresAt: record.expiresAt,
      });
    }
  }
  return [...courses.values()];
}
