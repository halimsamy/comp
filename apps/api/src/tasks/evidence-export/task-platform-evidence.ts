import { db } from '@db';
import { toDbEvidenceFormType } from '@trycompai/company';
import type { Archiver } from 'archiver';
import { renderNativeEvidencePdf } from '../native-evidence/native-evidence-pdf';
import { ruleForTemplate } from '../native-evidence/native-evidence-rules';
import { listTaskForms } from '../task-forms';
import { sanitizeFilename } from './evidence-pdf-generator';
import {
  appendDocumentEvidence,
  loadDocumentBundle,
} from './framework-evidence-documents';

/**
 * A fresh Auto-evidence snapshot PDF for a task with a native-evidence rule,
 * or null when the task has none. Rendered at export time; nothing is stored.
 */
export async function renderTaskAutoEvidence({
  organizationId,
  taskId,
  now = new Date(),
}: {
  organizationId: string;
  taskId: string;
  now?: Date;
}): Promise<{ name: string; buffer: Buffer } | null> {
  const task = await db.task.findFirst({
    where: { id: taskId, organizationId },
    select: {
      title: true,
      taskTemplateId: true,
      frequency: true,
      organization: { select: { name: true, primaryColor: true } },
    },
  });
  const rule = task ? ruleForTemplate(task.taskTemplateId) : null;
  if (!task || !rule) return null;

  const result = await rule.evaluate({ organizationId, now, frequency: task.frequency });
  const { buffer, filename } = renderNativeEvidencePdf({
    rule,
    result,
    taskTitle: task.title,
    organizationName: task.organization.name,
    primaryColor: task.organization.primaryColor,
    now,
  });
  return { name: `auto-${filename}`, buffer };
}

/**
 * Evidence the task page shows that is not a task attachment: the Auto-evidence
 * snapshot and the submissions of its Structured evidence forms, one sub-folder
 * per form so the CSV's `files/` links keep working.
 */
export async function appendTaskPlatformEvidence({
  archive,
  organizationId,
  taskId,
  folderPath,
  uniqueName,
  now = new Date(),
}: {
  archive: Archiver;
  organizationId: string;
  taskId: string;
  folderPath: string;
  uniqueName: (rawName: string) => string;
  now?: Date;
}): Promise<void> {
  const snapshot = await renderTaskAutoEvidence({ organizationId, taskId, now });
  if (snapshot) {
    archive.append(snapshot.buffer, { name: `${folderPath}/${uniqueName(snapshot.name)}` });
  }

  for (const form of await listTaskForms({ organizationId, taskId })) {
    const bundle = await loadDocumentBundle({
      organizationId,
      formType: toDbEvidenceFormType(form.formType),
    });
    if (!bundle.csv) continue;
    await appendDocumentEvidence({
      archive,
      bundle,
      folderPath: `${folderPath}/${uniqueName(sanitizeFilename(bundle.title))}`,
    });
  }
}
