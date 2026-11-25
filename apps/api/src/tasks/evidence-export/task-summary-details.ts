import type { Prisma, TaskFrequency, TaskStatus } from '@db';
import type { HouseKeyValue, PdfSection } from '../../utils/house-pdf';
import { cleanTextForPDF } from './evidence-pdf-format';
import { humanize, personName } from './registers/register-csv';

const person = { select: { user: { select: { name: true, email: true } } } } as const;

/** Add to the task query's `include` so `taskDetails` can name the assignee and approver. */
export const TASK_DETAILS_INCLUDE = {
  assignee: person,
  approver: person,
} satisfies Prisma.TaskInclude;

type Person = { user: { name: string | null; email: string } } | null;

/** What the task summary PDF states about the task itself. */
export type TaskDetails = {
  description: string;
  status: TaskStatus;
  notRelevantJustification: string | null;
  frequency: TaskFrequency | null;
  assignee: string;
  approver: string;
  approvedAt: Date | null;
  lastCompletedAt: Date | null;
  reviewDate: Date | null;
  updatedAt: Date | null;
};

export function taskDetails(task: {
  description?: string | null;
  status?: TaskStatus;
  notRelevantJustification?: string | null;
  frequency?: TaskFrequency | null;
  assignee?: Person;
  approver?: Person;
  approvedAt?: Date | null;
  lastCompletedAt?: Date | null;
  reviewDate?: Date | null;
  updatedAt?: Date | null;
}): TaskDetails {
  return {
    description: task.description ?? '',
    status: task.status ?? 'todo',
    notRelevantJustification: task.notRelevantJustification ?? null,
    frequency: task.frequency ?? null,
    assignee: personName(task.assignee?.user),
    approver: personName(task.approver?.user),
    approvedAt: task.approvedAt ?? null,
    lastCompletedAt: task.lastCompletedAt ?? null,
    reviewDate: task.reviewDate ?? null,
    updatedAt: task.updatedAt ?? null,
  };
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '-');

/** Cover rows: status, assignee, approver, review frequency, last update and next review. */
export function taskDetailRows(task: TaskDetails): HouseKeyValue[] {
  const status = task.notRelevantJustification
    ? `${humanize(task.status)} (${task.notRelevantJustification})`
    : humanize(task.status);
  return [
    { label: 'Status', value: cleanTextForPDF(status) },
    { label: 'Assignee', value: cleanTextForPDF(task.assignee) || 'Unassigned' },
    {
      label: 'Approver',
      value: task.approver
        ? `${cleanTextForPDF(task.approver)}${task.approvedAt ? `, approved ${day(task.approvedAt)}` : ', not approved yet'}`
        : 'None',
    },
    { label: 'Review frequency', value: task.frequency ? humanize(task.frequency) : 'Not set' },
    { label: 'Last completed', value: day(task.lastCompletedAt) },
    { label: 'Next review', value: day(task.reviewDate) },
    { label: 'Last updated', value: day(task.updatedAt) },
  ];
}

export function taskDescriptionSection(task: TaskDetails): PdfSection {
  return {
    heading: 'Task description',
    emptyText: 'No description.',
    paragraphs: task.description.trim() ? [{ text: cleanTextForPDF(task.description) }] : undefined,
  };
}
