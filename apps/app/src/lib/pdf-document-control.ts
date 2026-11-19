import type { jsPDF as JsPDFType } from 'jspdf';

export interface PdfDocumentControl {
  organizationName: string;
  logo: { dataUrl: string; format: 'PNG' | 'JPEG' } | null;
  rows: { label: string; value: string }[];
  revisions?: PdfRevision[];
}

export interface PdfRevision {
  version: string;
  date: string;
  approvedBy: string;
  changes: string;
}

const LOGO_MAX_WIDTH = 40;
const LOGO_MAX_HEIGHT = 14;
const ROW_HEIGHT = 6;
const LABEL_WIDTH = 42;

// Helvetica only covers Latin-1; keep the block printable.
const toPdfText = (text: string) => text.replace(/[—–]/g, '-').replace(/[^\x20-\xFF]/g, '');

/**
 * Draws the document-control header (logo, organization, owner, version,
 * approver, dates) and returns the y position where content should start.
 */
export function drawDocumentControlHeader({
  doc,
  control,
  title,
  margin,
  y,
}: {
  doc: JsPDFType;
  control: PdfDocumentControl;
  title: string;
  margin: number;
  y: number;
}): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let cursor = y;

  if (control.logo) {
    try {
      const { width, height } = doc.getImageProperties(control.logo.dataUrl);
      const scale = Math.min(LOGO_MAX_WIDTH / width, LOGO_MAX_HEIGHT / height, 1);
      doc.addImage(control.logo.dataUrl, control.logo.format, margin, cursor - 4, width * scale, height * scale);
    } catch {
      // A broken logo must not block the download.
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(toPdfText(control.organizationName), pageWidth - margin, cursor, { align: 'right' });
  cursor += control.logo ? LOGO_MAX_HEIGHT + 2 : 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(toPdfText(title), contentWidth);
  doc.text(titleLines, margin, cursor);
  cursor += titleLines.length * 7 + 2;

  const tableTop = cursor - 4;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.rect(margin, tableTop, contentWidth, control.rows.length * ROW_HEIGHT + 2);
  doc.setFontSize(9);
  control.rows.forEach((row, index) => {
    const rowY = cursor + index * ROW_HEIGHT;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(toPdfText(row.label), margin + 3, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(toPdfText(row.value), margin + 3 + LABEL_WIDTH, rowY);
  });

  doc.setTextColor(0, 0, 0);
  return cursor + control.rows.length * ROW_HEIGHT + 8;
}

const REVISION_COLUMNS: { key: keyof PdfRevision; label: string; share: number }[] = [
  { key: 'version', label: 'Version', share: 0.12 },
  { key: 'date', label: 'Approved', share: 0.24 },
  { key: 'approvedBy', label: 'Approved by', share: 0.24 },
  { key: 'changes', label: 'Changes', share: 0.4 },
];

/**
 * Draws the "Revision history" table (ISO 27001 7.5.3 change control) from
 * approved policy versions. Returns the y position after the table.
 */
export function drawRevisionHistory({
  doc,
  revisions,
  margin,
  y,
}: {
  doc: JsPDFType;
  revisions: PdfRevision[];
  margin: number;
  y: number;
}): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let cursor = y + 8;
  const ensureSpace = (needed: number) => {
    if (cursor + needed <= pageHeight - 20) return;
    doc.addPage();
    cursor = 20;
  };

  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Revision history', margin, cursor);
  cursor += 8;

  doc.setFontSize(9);
  if (revisions.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('No approved versions yet.', margin, cursor);
    doc.setTextColor(0, 0, 0);
    return cursor + 6;
  }

  const drawRow = (cells: Record<keyof PdfRevision, string>, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    let x = margin;
    const wrapped = REVISION_COLUMNS.map((col) =>
      doc.splitTextToSize(toPdfText(cells[col.key]), contentWidth * col.share - 4),
    );
    const height = Math.max(...wrapped.map((lines) => lines.length)) * 4 + 3;
    ensureSpace(height);
    if (bold) {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, cursor - 4, contentWidth, height, 'F');
    }
    REVISION_COLUMNS.forEach((col, index) => {
      doc.text(wrapped[index], x + 2, cursor);
      x += contentWidth * col.share;
    });
    cursor += height;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, cursor - 4, margin + contentWidth, cursor - 4);
  };

  doc.setTextColor(30, 41, 59);
  drawRow({ version: 'Version', date: 'Approved', approvedBy: 'Approved by', changes: 'Changes' }, true);
  revisions.forEach((revision) => drawRow(revision, false));
  doc.setTextColor(0, 0, 0);
  return cursor + 4;
}
