import {
  metadataRows,
  standardLabel,
  type IsmsExportMetadata,
} from '../../isms/utils/export-shared';
import { renderIsmsPdf } from '../../isms/utils/pdf-renderer';

export type SOAExportFormat = 'pdf';

export interface SOAExportQuestion {
  id: string;
  text: string;
  columnMapping: {
    closure?: string | null;
    title: string | null;
    control_objective: string | null;
    isApplicable: boolean | null;
    justification: string | null;
    /** Implemented / In progress / Not started, from the mapped controls. */
    implementation?: string | null;
    /** Supplier that operates the control, when inherited. */
    inheritedFrom?: string | null;
  };
  answer: string | null;
}

export interface SOAExportMetadata {
  preparedBy: string | null;
  answeredQuestions: number;
  totalQuestions: number;
  approvedAt?: Date | string | null;
  declinedAt?: Date | string | null;
  status?: string | null;
  approverName?: string | null;
  organizationName?: string | null;
  primaryColor?: string | null;
}

export interface SOAExportResult {
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
}

export function generateSOAExportFile(
  questions: SOAExportQuestion[],
  frameworkName: string,
  version: number,
  metadata: SOAExportMetadata,
  format: SOAExportFormat = 'pdf',
): SOAExportResult {
  if (format !== 'pdf') {
    throw new Error(`Unsupported SOA export format: ${format}`);
  }

  return {
    fileBuffer: generateSOAPDF(questions, frameworkName, version, metadata),
    mimeType: 'application/pdf',
    filename: `statement-of-applicability-${sanitizeFrameworkName(frameworkName)}-v${version}.pdf`,
  };
}

function generateSOAPDF(
  questions: SOAExportQuestion[],
  frameworkName: string,
  version: number,
  metadata: SOAExportMetadata,
): Buffer {
  const progress =
    metadata.totalQuestions > 0
      ? Math.round((metadata.answeredQuestions / metadata.totalQuestions) * 100)
      : 0;
  const ismsMetadata: IsmsExportMetadata = {
    title: 'Statement of Applicability',
    clause: '6.1.3 d)',
    documentCode: `${orgCode(metadata.organizationName ?? null)}-ISMS-SOA`,
    standardLabel: standardLabel(frameworkName),
    frameworkName,
    version,
    preparedBy: metadata.preparedBy || 'Comp AI',
    owner: null,
    status: soaStatus(metadata),
    approverName: metadata.approverName ?? null,
    approvedAt: metadata.approvedAt ?? null,
    declinedAt: metadata.declinedAt ?? null,
    classification: 'Internal',
    nextReview: 'Annual, or on material change',
    issueDate: metadata.approvedAt ?? new Date(),
    organizationName: metadata.organizationName ?? null,
    primaryColor: metadata.primaryColor ?? null,
  };
  const rows = [
    // preparedBy is whoever submitted the SoA, not its owner: keep the old label.
    ...metadataRows(ismsMetadata).map((row) =>
      row.label === 'Owner' ? { label: 'Prepared by', value: row.value } : row,
    ),
    {
      label: 'Progress',
      value: `${metadata.answeredQuestions} / ${metadata.totalQuestions} controls answered (${progress}%)`,
    },
  ];

  return renderIsmsPdf({
    metadata: { ...ismsMetadata, rows },
    sections: [
      {
        heading: '1. Annex A controls',
        intro:
          'The applicability decision, implementation status and justification for each control, as required by ISO/IEC 27001:2022 clause 6.1.3 d).',
        emptyText: 'No controls in this Statement of Applicability.',
        table: {
          headers: ['Control', 'Title and objective', 'Applicable', 'Justification'],
          // mm, summing to the 174mm A4 content width; auto-sizing left Title narrow and rows tall.
          columnWidths: [18, 66, 30, 60],
          rows: questions.map((question, index) => soaRow(question, index)),
        },
      },
    ],
  });
}

function soaRow(question: SOAExportQuestion, index: number): string[] {
  const mapped = question.columnMapping ?? {
    title: null,
    control_objective: null,
    isApplicable: null,
    justification: null,
  };
  const justification =
    typeof mapped.justification === 'string' && mapped.justification.trim()
      ? mapped.justification
      : question.answer || 'No justification provided';
  const title = mapped.title || question.text || 'Untitled Control';
  const inherited = mapped.inheritedFrom ? ` (inherited from ${mapped.inheritedFrom})` : '';
  const implementation =
    mapped.isApplicable === true && mapped.implementation
      ? `\nImplementation:\n${mapped.implementation}`
      : '';
  return [
    mapped.closure ? toAnnexCode(mapped.closure) : String(index + 1),
    mapped.control_objective ? `${title}\n\n${mapped.control_objective}` : title,
    `${applicabilityLabel(mapped.isApplicable)}${inherited}${implementation}`,
    justification,
  ];
}

/**
 * Org code for the document ID ("Spare Payments" -> "SP"), same rule as the ISMS packs.
 * shortcut: copy of the private orgCode in isms/utils/export-metadata.ts, export and reuse it when that file is next touched.
 */
function orgCode(name: string | null): string {
  const cleaned = (name ?? '').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  if (!cleaned) return 'ORG';
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

/**
 * SoA document status in the ISMS vocabulary of the metadata table. Only an
 * approval makes it "approved": `completed` alone means every control is
 * answered, and a decline also leaves the status at `completed`.
 */
export function soaStatus(
  metadata: Pick<SOAExportMetadata, 'approvedAt' | 'declinedAt' | 'status'>,
): string {
  if (metadata.declinedAt) return 'declined';
  if (metadata.approvedAt) return 'approved';
  if (metadata.status === 'needs_review') return 'needs_review';
  // Fully answered but not yet approved: not a draft (the approval line still says "Not approved").
  if (metadata.status === 'completed') return 'completed';
  return 'draft';
}

/** Yes / No, or "Not yet decided" for a control without an answer (never shown as Yes). */
export function applicabilityLabel(isApplicable: boolean | null | undefined): string {
  if (isApplicable === true) return 'Yes';
  if (isApplicable === false) return 'No';
  return 'Not yet decided';
}

/** "5.15" -> "A.5.15" (ISO 27001 Annex A reference). */
export function toAnnexCode(closure: string): string {
  return closure.startsWith('A.') ? closure : `A.${closure}`;
}

function sanitizeFrameworkName(frameworkName: string): string {
  return (frameworkName || 'soa')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

