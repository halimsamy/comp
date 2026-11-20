import type { IsmsExportSection } from '../../isms/utils/export-shared';
import { standardLabel } from '../../isms/utils/export-shared';
import { renderIsmsPdf } from '../../isms/utils/pdf-renderer';

/**
 * Numbers headings ('1. Review') as the ISMS documents do. Left alone when the
 * caller numbered them already (the PCI DSS worksheet follows the form's own numbers).
 */
export function numberSections(sections: IsmsExportSection[]): IsmsExportSection[] {
  if (sections.some((s) => /^\d+\.\s/.test(s.heading))) return sections;
  let n = 0;
  return sections.map((s) => (s.heading ? { ...s, heading: `${++n}. ${s.heading}` } : s));
}

/**
 * A platform record (compensating controls worksheet, risk review snapshot,
 * vendor report summary) as a PDF in the same house style as the ISMS
 * documents: cover metadata table, numbered sections, real tables.
 */
export function renderRecordPdf({
  title,
  documentCode,
  clause,
  frameworkName,
  organizationName,
  primaryColor,
  owner,
  approverName = null,
  approvedAt = null,
  issueDate,
  nextReview = 'Not scheduled',
  sections,
}: {
  title: string;
  documentCode: string;
  clause: string;
  frameworkName: string;
  organizationName: string;
  primaryColor: string | null;
  owner: string | null;
  approverName?: string | null;
  approvedAt?: Date | null;
  issueDate: Date | null;
  nextReview?: string;
  sections: IsmsExportSection[];
}): Buffer {
  return renderIsmsPdf({
    sections: numberSections(sections),
    metadata: {
      title,
      clause,
      documentCode,
      standardLabel: standardLabel(frameworkName),
      frameworkName,
      version: 1,
      preparedBy: null,
      owner,
      status: approvedAt ? 'approved' : null,
      approverName,
      approvedAt,
      declinedAt: null,
      classification: 'Confidential',
      nextReview,
      issueDate,
      organizationName,
      primaryColor,
    },
  });
}
