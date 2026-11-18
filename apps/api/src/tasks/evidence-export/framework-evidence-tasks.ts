import type { Archiver } from 'archiver';
import { attachmentValidInPeriod } from '../../attachments/attachment-validity';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
  getTaskAttachments,
  type TaskAttachment,
} from './evidence-attachment-streamer';
import {
  getAutomationHeaders,
  streamAutomationRuns,
} from './evidence-data-loader';
import type { AuditPeriod } from './framework-evidence-native-archive';
import type { NormalizedEvidenceRun } from './evidence-export.types';
import {
  generateAutomationPDFFromStream,
  generateTaskSummaryPDF,
  sanitizeFilename,
} from './evidence-pdf-generator';

export type TaskBundle = {
  title: string;
  summaryPdf: Buffer;
  automationPdfs: Array<{ name: string; pdf: Buffer }>;
  attachments: TaskAttachment[];
};

/** True when `date` falls inside the (inclusive, day-granular) audit period. */
export function inPeriod(date: Date | null, period: AuditPeriod): boolean {
  if (!period.from && !period.to) return true;
  if (!date) return false;
  if (period.from && date < period.from) return false;
  return !(period.to && date > period.to);
}

async function* runsInPeriod(
  batches: AsyncIterable<NormalizedEvidenceRun[]>,
  period: AuditPeriod,
): AsyncGenerator<NormalizedEvidenceRun[]> {
  for await (const batch of batches) {
    const kept = batch.filter((run) => inPeriod(run.startedAt ?? run.completedAt, period));
    if (kept.length > 0) yield kept;
  }
}

export async function loadTaskBundle({
  organizationId,
  taskId,
  period = {},
}: {
  organizationId: string;
  taskId: string;
  period?: AuditPeriod;
}): Promise<TaskBundle> {
  const [headers, allAttachments] = await Promise.all([
    getAutomationHeaders({ organizationId, taskId }),
    getTaskAttachments(organizationId, taskId),
  ]);
  // A file counts when it was valid evidence at some point in the audit period.
  const attachments = allAttachments.filter((a) => attachmentValidInPeriod(a, period));

  const automationPdfs: TaskBundle['automationPdfs'] = [];
  for (const header of headers.automations) {
    const prefix = header.type === 'app_automation' ? 'app' : 'custom';
    automationPdfs.push({
      name: `${prefix}-${sanitizeFilename(header.name)}-${header.id.slice(-8)}.pdf`,
      pdf: await generateAutomationPDFFromStream(
        header,
        { organizationName: headers.organizationName, taskTitle: headers.taskTitle },
        runsInPeriod(streamAutomationRuns({ taskId, header }), period),
      ),
    });
  }

  return {
    title: headers.taskTitle,
    summaryPdf: generateTaskSummaryPDF(headers, {
      attachmentsCount: attachments.length,
    }),
    automationPdfs,
    attachments,
  };
}

export async function appendTaskEvidence({
  archive,
  bundle,
  folderPath,
}: {
  archive: Archiver;
  bundle: TaskBundle;
  folderPath: string;
}): Promise<void> {
  archive.append(bundle.summaryPdf, { name: `${folderPath}/00-summary.pdf` });
  for (const { name, pdf } of bundle.automationPdfs) {
    archive.append(pdf, { name: `${folderPath}/${name}` });
  }

  const uniqueName = createFilenameTracker();
  for (const attachment of bundle.attachments) {
    await appendAttachmentToArchive({
      archive,
      attachment,
      folderPath: `${folderPath}/attachments`,
      uniqueName,
    });
  }
}
