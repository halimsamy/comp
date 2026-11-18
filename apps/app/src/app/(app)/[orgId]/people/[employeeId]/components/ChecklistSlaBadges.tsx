import type { ChecklistItem } from '@/hooks/use-offboarding-checklist';
import { Badge } from '@trycompai/design-system';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Auto-complete and due-date badges for onboarding/offboarding items with an SLA. */
export function ChecklistSlaBadges({ item }: { item: ChecklistItem }) {
  return (
    <>
      {item.autoCompleteSource && (
        <div>
          <Badge variant="secondary">Automatic</Badge>
        </div>
      )}
      {item.overdue && item.dueDate && (
        <div>
          <Badge variant="destructive">Overdue · {formatDate(item.dueDate)}</Badge>
        </div>
      )}
      {!item.completed && !item.overdue && item.dueDate && (
        <div>
          <Badge variant="outline">Due {formatDate(item.dueDate)}</Badge>
        </div>
      )}
    </>
  );
}
