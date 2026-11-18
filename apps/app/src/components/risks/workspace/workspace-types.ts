/** A member offered as owner / reviewer in the risk workspace. */
export interface WorkspaceMember {
  id: string;
  user: { name: string | null; email: string };
}

export const memberLabel = (member: WorkspaceMember) => member.user.name || member.user.email;

export const formatDay = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';

/** Whole days from today until `value` (negative when past). */
export function daysUntil({ value, now = new Date() }: { value: string; now?: Date }): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(value);
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}
