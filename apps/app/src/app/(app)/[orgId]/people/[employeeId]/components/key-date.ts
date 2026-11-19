/**
 * #84: onboard/offboard dates are calendar days stored as UTC midnight. The
 * picker works in local time, so converting with toISOString() shifted the day
 * for anyone east or west of UTC.
 */
export function toUtcDay(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}

export function fromUtcDay(value: string | Date): Date {
  const d = new Date(value);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
