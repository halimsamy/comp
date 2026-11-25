/**
 * Evidence PDF Generator
 * Task evidence summary and automation run reports in the house PDF style
 * (same cover, metadata table, sections and footer as the ISMS documents).
 */

import { format } from 'date-fns';
import {
  renderHousePdf,
  type HouseKeyValue,
  type PdfBlock,
} from '../../utils/house-pdf';
import { cleanTextForPDF, formatJsonForPDF } from './evidence-pdf-format';
import { taskDescriptionSection, taskDetailRows } from './task-summary-details';
import type {
  NormalizedAutomation,
  NormalizedEvidenceRun,
  TaskEvidenceSummary,
} from './evidence-export.types';

type AutomationContext = {
  organizationName: string;
  taskTitle: string;
  primaryColor?: string | null;
};

const RUN_HEADERS = ['#', 'Run', 'Status', 'Duration', 'Outcome'];

const when = (date: Date) => format(date, 'PPpp');
const typeLabel = (type: NormalizedAutomation['type']) =>
  type === 'app_automation' ? 'App Automation' : 'Custom Automation';
// Prefixed CUIDs ("ea_…", "tsk_…") are shortened; check slugs ("github-mfa") stay readable.
const docCode = (id: string) =>
  `EVD-${(/^[a-z]+_/.test(id) ? id.slice(-8) : id).toUpperCase()}`;

function runOutcome(run: NormalizedEvidenceRun): string {
  if (run.type === 'app_automation') {
    return `Checked ${run.totalChecked} · Passed ${run.passedCount} · Failed ${run.failedCount}`;
  }
  return run.evaluationStatus
    ? `Evaluation ${run.evaluationStatus.toUpperCase()}`
    : '—';
}

const runDuration = (run: NormalizedEvidenceRun) =>
  run.durationMs ? `${run.durationMs}ms` : '—';

/** One run: overview row + the detail blocks (metrics, error, output, logs, results). */
function runToPdf(
  run: NormalizedEvidenceRun,
  index: number,
): { row: string[]; blocks: PdfBlock[] } {
  const row = [
    String(index),
    when(run.createdAt),
    run.status.toUpperCase(),
    runDuration(run),
    runOutcome(run),
  ];

  const facts: HouseKeyValue[] = [
    { label: 'Status', value: run.status.toUpperCase() },
    { label: 'Duration', value: runDuration(run) },
  ];
  if (run.type === 'app_automation') {
    facts.push({ label: 'Results', value: runOutcome(run) });
  } else if (run.evaluationStatus) {
    facts.push({
      label: 'Evaluation',
      value: run.evaluationStatus.toUpperCase(),
    });
    if (run.evaluationReason) {
      facts.push({
        label: 'Reason',
        value: cleanTextForPDF(run.evaluationReason),
      });
    }
  }
  if (run.error)
    facts.push({ label: 'Error', value: cleanTextForPDF(run.error) });

  const blocks: PdfBlock[] = [
    { kind: 'subheading', text: `Run ${index} · ${when(run.createdAt)}` },
    { kind: 'keyValues', rows: facts },
  ];
  if (run.output) {
    blocks.push({ kind: 'paragraph', text: 'Output', bold: true });
    blocks.push({ kind: 'code', text: formatJsonForPDF(run.output) });
  }
  if (run.logs) {
    blocks.push({ kind: 'paragraph', text: 'Logs', bold: true });
    blocks.push({ kind: 'code', text: formatJsonForPDF(run.logs) });
  }
  if (run.results.length > 0) {
    blocks.push({
      kind: 'paragraph',
      text: `Results (${run.results.length})`,
      bold: true,
    });
    blocks.push({
      kind: 'table',
      table: {
        headers: ['Result', 'Check', 'Resource', 'Details'],
        // Fixed widths (sum = 174mm content width) so long resource IDs wrap instead of squeezing Details.
        columnWidths: [16, 42, 50, 66],
        rows: run.results.map((result) => [
          result.passed ? 'PASS' : 'FAIL',
          cleanTextForPDF(result.title),
          cleanTextForPDF(`${result.resourceType}/${result.resourceId}`),
          cleanTextForPDF(
            [
              result.description,
              result.severity ? `Severity: ${result.severity}` : null,
              result.remediation ? `Remediation: ${result.remediation}` : null,
            ]
              .filter(Boolean)
              .join('\n') || '—',
          ),
        ]),
      },
    });
    for (const result of run.results) {
      if (!result.evidence) continue;
      blocks.push({
        kind: 'paragraph',
        text: cleanTextForPDF(
          `Evidence: ${result.title} (${result.resourceType}/${result.resourceId})`,
        ),
        muted: true,
      });
      blocks.push({ kind: 'code', text: formatJsonForPDF(result.evidence) });
    }
  }
  return { row, blocks };
}

/** Accumulates runs one at a time so callers can feed batches and drop them. */
class AutomationReport {
  private readonly rows: string[][] = [];
  private readonly blocks: PdfBlock[] = [];

  constructor(
    private readonly header: NormalizedAutomation,
    private readonly context: AutomationContext,
  ) {}

  add(run: NormalizedEvidenceRun): void {
    const { row, blocks } = runToPdf(run, this.rows.length + 1);
    this.rows.push(row);
    this.blocks.push(...blocks);
  }

  render(): Buffer {
    const { header, context } = this;
    const rows: HouseKeyValue[] = [
      { label: 'Document ID', value: docCode(header.id) },
      { label: 'Task', value: cleanTextForPDF(context.taskTitle) },
      { label: 'Automation type', value: typeLabel(header.type) },
      ...(header.integrationName
        ? [{ label: 'Integration', value: header.integrationName }]
        : []),
      { label: 'Total runs', value: String(header.totalRuns) },
      { label: 'Successful', value: String(header.successfulRuns) },
      { label: 'Failed', value: String(header.failedRuns) },
      {
        label: 'Latest run',
        value: header.latestRunAt ? when(header.latestRunAt) : '—',
      },
      { label: 'Exported', value: when(new Date()) },
    ];
    return renderHousePdf({
      title: cleanTextForPDF(header.name),
      label: typeLabel(header.type),
      subtitle: 'Automation evidence',
      documentCode: docCode(header.id),
      organizationName: context.organizationName,
      primaryColor: context.primaryColor ?? null,
      rows,
      sections: [
        {
          heading: '1. Run history',
          emptyText: 'No runs recorded for this automation.',
          table: { headers: RUN_HEADERS, rows: this.rows },
        },
        ...(this.blocks.length
          ? [{ heading: '2. Run details', blocks: this.blocks }]
          : []),
      ],
    });
  }
}

/**
 * Generate PDF for a single automation (loads all runs into memory).
 * Use generateAutomationPDFFromStream for large automations.
 */
export function generateAutomationPDF(
  automation: NormalizedAutomation,
  context: AutomationContext,
): Buffer {
  const report = new AutomationReport(automation, context);
  for (const run of automation.runs) report.add(run);
  return report.render();
}

/**
 * Build a PDF from an async stream of run batches. Each batch's raw runs are
 * released once converted to compact text blocks; only the text is kept
 * until the document is rendered.
 */
export async function generateAutomationPDFFromStream(
  header: NormalizedAutomation,
  context: AutomationContext,
  runBatches: AsyncIterable<NormalizedEvidenceRun[]>,
): Promise<Buffer> {
  const report = new AutomationReport(header, context);
  for await (const batch of runBatches) {
    for (const run of batch) report.add(run);
  }
  return report.render();
}

/**
 * Generate a summary PDF for a task with all automations
 */
export function generateTaskSummaryPDF(
  summary: TaskEvidenceSummary,
  options?: { attachmentsCount?: number },
): Buffer {
  const appCount = summary.automations.filter(
    (a) => a.type === 'app_automation',
  ).length;
  const attachmentsCount = options?.attachmentsCount ?? 0;
  const rows: HouseKeyValue[] = [
    { label: 'Document ID', value: docCode(summary.taskId) },
    { label: 'Task', value: cleanTextForPDF(summary.taskTitle) },
    ...(summary.task ? taskDetailRows(summary.task) : []),
    { label: 'Exported', value: when(summary.exportedAt) },
    ...(attachmentsCount > 0
      ? [{ label: 'Attachments', value: String(attachmentsCount) }]
      : []),
    { label: 'Total automations', value: String(summary.automations.length) },
    { label: 'App automations', value: String(appCount) },
    {
      label: 'Custom automations',
      value: String(summary.automations.length - appCount),
    },
  ];
  return renderHousePdf({
    title: cleanTextForPDF(summary.taskTitle),
    label: 'Evidence Export Summary',
    subtitle: 'Task evidence',
    documentCode: docCode(summary.taskId),
    organizationName: summary.organizationName,
    primaryColor: summary.primaryColor ?? null,
    rows,
    sections: [
      ...(summary.task ? [taskDescriptionSection(summary.task)] : []),
      {
        heading: '1. Automations',
        emptyText: 'No automations for this task.',
        table: {
          headers: [
            'Automation',
            'Type',
            'Runs',
            'Successful',
            'Failed',
            'Last run',
          ],
          rows: summary.automations.map((automation) => [
            cleanTextForPDF(automation.name),
            automation.type === 'app_automation' ? 'App' : 'Custom',
            String(automation.totalRuns),
            String(automation.successfulRuns),
            String(automation.failedRuns),
            automation.latestRunAt ? when(automation.latestRunAt) : '—',
          ]),
        },
      },
    ],
  });
}

/**
 * Sanitize filename for safe file system usage
 * Falls back to 'export' if name contains only non-ASCII characters
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  // Fallback for names with only non-ASCII characters (e.g., Japanese, Arabic)
  return sanitized || 'export';
}
