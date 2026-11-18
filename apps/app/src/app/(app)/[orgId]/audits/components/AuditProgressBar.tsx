import type { AuditProgress } from '@/hooks/use-audits';
import { Text } from '@trycompai/design-system';

const SEGMENTS = [
  { key: 'accepted', label: 'Accepted', color: 'bg-success' },
  { key: 'requested', label: 'Requested', color: 'bg-warning' },
  { key: 'flagged', label: 'Flagged', color: 'bg-destructive' },
  { key: 'notReviewed', label: 'Not reviewed', color: 'bg-muted-foreground/30' },
] as const;

/** Stacked bar of the auditor's assessments across in-scope requirements. */
export function AuditProgressBar({ progress }: { progress: AuditProgress }) {
  const total = Math.max(progress.total, 1);
  return (
    <div className="space-y-2">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${progress.accepted} of ${progress.total} requirements accepted`}
      >
        {SEGMENTS.map(({ key, color }) =>
          progress[key] > 0 ? (
            <div key={key} className={color} style={{ width: `${(progress[key] / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTS.map(({ key, label, color }) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${color}`} />
            <Text size="xs" variant="muted">
              {label}: {progress[key]}
            </Text>
          </span>
        ))}
      </div>
    </div>
  );
}
