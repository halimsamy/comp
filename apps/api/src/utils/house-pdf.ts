import type { IsmsKeyValue } from '../isms/utils/export-shared';
import type { PdfBlock, PdfSection } from '../isms/utils/pdf-blocks';
import { renderIsmsPdf } from '../isms/utils/pdf-renderer';

export type { IsmsKeyValue as HouseKeyValue, PdfBlock, PdfSection };

/**
 * Any platform PDF (policy, evidence report, certificate, NDA…) in the same
 * house style as the ISMS documents: organization + label + title + subtitle
 * cover, a metadata table, accent-coloured section headings, real tables and
 * the "org · classification | code · Page n of m" footer.
 */
export function renderHousePdf({
  title,
  subtitle = '',
  label = '',
  documentCode,
  organizationName,
  primaryColor,
  classification = 'Confidential',
  rows,
  sections,
}: {
  title: string;
  /** Line under the title, e.g. "Clause A.5.1" or "Task evidence". */
  subtitle?: string;
  /** Small line above the title, e.g. "ISO/IEC 27001:2022" or "Policy". */
  label?: string;
  /** Short code in the footer, e.g. "POL-ACCESS-v3". */
  documentCode: string;
  organizationName: string | null;
  primaryColor: string | null;
  classification?: string;
  /** The cover metadata table. */
  rows: IsmsKeyValue[];
  sections: PdfSection[];
}): Buffer {
  return renderIsmsPdf({
    sections,
    metadata: {
      title,
      subtitle,
      clause: '',
      documentCode,
      standardLabel: label,
      frameworkName: '',
      version: 1,
      preparedBy: null,
      owner: null,
      status: null,
      approverName: null,
      approvedAt: null,
      declinedAt: null,
      classification,
      nextReview: '',
      issueDate: null,
      organizationName,
      primaryColor,
      rows,
    },
  });
}
