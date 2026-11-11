import { db, type EvidenceFormType as DbEvidenceFormType } from '@db';
import { toExternalEvidenceFormType } from '@trycompai/company';
import type { Archiver } from 'archiver';
import {
  getCsvFieldValue,
  toCsvRow,
} from '../../evidence-forms/evidence-forms-csv';
import { evidenceFormDefinitions } from '../../evidence-forms/evidence-forms.definitions';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
  type ArchivableFile,
} from './evidence-attachment-streamer';

export type DocumentBundle = {
  title: string;
  csv: string | null;
  /** Names are already unique within the bundle's `files/` folder. */
  files: ArchivableFile[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * All submissions of one document type as a CSV (same columns as the
 * Documents page export), with uploaded files referenced by their path in the
 * ZIP instead of an expiring signed URL.
 */
export async function loadDocumentBundle({
  organizationId,
  formType,
}: {
  organizationId: string;
  formType: DbEvidenceFormType;
}): Promise<DocumentBundle> {
  const externalType = toExternalEvidenceFormType(formType);
  const form = externalType ? evidenceFormDefinitions[externalType] : null;
  const title = form?.title ?? formType;

  const submissions = await db.evidenceSubmission.findMany({
    where: { organizationId, formType },
    include: { submittedBy: { select: { name: true, email: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  if (!form || submissions.length === 0) return { title, csv: null, files: [] };

  const fields = form.fields.filter((field) => field.key !== 'submissionDate');
  const uniqueName = createFilenameTracker();
  const files: ArchivableFile[] = [];

  const rows = submissions.map((submission) => {
    const data = isRecord(submission.data) ? submission.data : {};
    const csvData: Record<string, unknown> = { ...data };

    for (const [key, value] of Object.entries(data)) {
      if (!isRecord(value) || typeof value.fileKey !== 'string') continue;
      // Legacy or tampered rows may point outside this org's namespace: never export those.
      if (!value.fileKey.startsWith(`${organizationId}/`)) {
        csvData[key] = { ...value, downloadUrl: null };
        continue;
      }
      const name = uniqueName(
        typeof value.fileName === 'string' ? value.fileName : key,
      );
      files.push({ id: submission.id, name, url: value.fileKey });
      csvData[key] = { ...value, downloadUrl: `files/${name}` };
    }

    return [
      submission.id,
      typeof data.submissionDate === 'string'
        ? data.submissionDate
        : submission.submittedAt.toISOString(),
      submission.submittedBy?.name ?? '',
      submission.submittedBy?.email ?? '',
      ...fields.map((field) =>
        getCsvFieldValue({ value: csvData[field.key], field }),
      ),
    ];
  });

  const headers = [
    'submissionId',
    'submissionDate',
    'submittedByName',
    'submittedByEmail',
    ...fields.map((field) => field.key),
  ];

  return {
    title,
    csv: [toCsvRow(headers), ...rows.map((row) => toCsvRow(row))].join('\n'),
    files,
  };
}

export async function appendDocumentEvidence({
  archive,
  bundle,
  folderPath,
}: {
  archive: Archiver;
  bundle: DocumentBundle;
  folderPath: string;
}): Promise<void> {
  if (!bundle.csv) {
    archive.append('No submissions yet.\n', {
      name: `${folderPath}/NO_SUBMISSIONS.txt`,
    });
    return;
  }

  archive.append(bundle.csv, { name: `${folderPath}/submissions.csv` });
  for (const file of bundle.files) {
    await appendAttachmentToArchive({
      archive,
      attachment: file,
      folderPath: `${folderPath}/files`,
      uniqueName: (name) => name,
    });
  }
}
