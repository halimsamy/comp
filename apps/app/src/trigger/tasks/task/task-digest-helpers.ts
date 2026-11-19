export type DigestFrequency = 'daily' | 'weekly';

/** The user's task digest cadence from User.emailPreferences (default weekly). */
export function getDigestFrequency(preferences: unknown): DigestFrequency {
  if (!preferences || typeof preferences !== 'object' || !('digestFrequency' in preferences)) {
    return 'weekly';
  }
  return preferences.digestFrequency === 'daily' ? 'daily' : 'weekly';
}

/** Weekly digests go out on Mondays (UTC); daily ones every day. */
export function isDigestDue({
  frequency,
  now = new Date(),
}: {
  frequency: DigestFrequency;
  now?: Date;
}): boolean {
  return frequency === 'daily' || now.getUTCDay() === 1;
}

/**
 * On Mondays owners and admins get their task list inside the compliance digest
 * (apps/api trigger/overview/weekly-compliance-digest.ts), so this job skips them
 * unless they turned the compliance digest off.
 */
export function isFoldedIntoComplianceDigest({
  role,
  now = new Date(),
}: {
  role: string | null;
  now?: Date;
}): boolean {
  const roles = (role ?? '').split(',').map((r) => r.trim());
  return now.getUTCDay() === 1 && (roles.includes('owner') || roles.includes('admin'));
}

interface DigestTask {
  id: string;
  title: string;
  assigneeId: string | null;
}

/** A member's digest: tasks assigned to them, plus unassigned ones for owners/admins so nothing goes unowned. */
export function selectDigestTasks({
  tasks,
  memberId,
  role,
}: {
  tasks: DigestTask[];
  memberId: string;
  role: string | null;
}): Array<{ id: string; title: string }> {
  const roles = (role ?? '').split(',').map((r) => r.trim());
  const seesUnassigned = roles.includes('owner') || roles.includes('admin');
  return tasks
    .filter((t) => t.assigneeId === memberId || (seesUnassigned && !t.assigneeId))
    .map(({ id, title }) => ({ id, title }));
}
