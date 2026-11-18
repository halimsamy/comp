/** Idle timeout labels; null means off. 15 minutes meets PCI DSS v4.0.1 8.2.8. */
export function idleTimeoutLabel(minutes: number | null): string {
  if (!minutes) return 'Off (sessions last up to 7 days)';
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1440) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
}

export const PCI_IDLE_TIMEOUT_MINUTES = 15;

export function meetsPciIdleTimeout(minutes: number | null): boolean {
  return !!minutes && minutes <= PCI_IDLE_TIMEOUT_MINUTES;
}
