import type { Archiver } from 'archiver';
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

export async function loadTaskBundle({
  organizationId,
  taskId,
}: {
  organizationId: string;
  taskId: string;
}): Promise<TaskBundle> {
  const [headers, attachments] = await Promise.all([
    getAutomationHeaders({ organizationId, taskId }),
    getTaskAttachments(organizationId, taskId),
  ]);

  const automationPdfs: TaskBundle['automationPdfs'] = [];
  for (const header of headers.automations) {
    const prefix = header.type === 'app_automation' ? 'app' : 'custom';
    automationPdfs.push({
      name: `${prefix}-${sanitizeFilename(header.name)}-${header.id.slice(-8)}.pdf`,
      pdf: await generateAutomationPDFFromStream(
        header,
        { organizationName: headers.organizationName, taskTitle: headers.taskTitle },
        streamAutomationRuns({ taskId, header }),
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
