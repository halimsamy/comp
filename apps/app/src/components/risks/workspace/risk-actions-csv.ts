import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';

export const ACTION_STATUS_LABEL: Record<RiskTreatmentAction['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  canceled: 'Canceled',
};

/** Quote a CSV cell; neutralise spreadsheet formulas (=, +, -, @) from user text. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const day = (value: string | null) => (value ? value.slice(0, 10) : '');

/** The risk treatment plan as CSV (ISO 27001 6.1.3 / 8.3 evidence). */
export function buildRiskActionsCsv(actions: RiskTreatmentAction[]): string {
  const header = ['Action', 'Risk', 'Owner', 'Due date', 'Status', 'Completed on', 'Overdue'];
  const rows = actions.map((action) => [
    action.title,
    action.risk?.title ?? '',
    action.assignee?.user.name || action.assignee?.user.email || 'Unassigned',
    day(action.dueDate),
    ACTION_STATUS_LABEL[action.status],
    day(action.completedAt),
    action.isOverdue ? 'Yes' : 'No',
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv({ csv, filename }: { csv: string; filename: string }) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
