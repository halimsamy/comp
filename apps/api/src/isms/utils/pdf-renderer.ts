import { jsPDF } from 'jspdf';
import { metadataRows, toPdfText, type IsmsExportMetadata } from './export-shared';
import {
  HAIRLINE,
  INK,
  MUTED,
  PdfCursor,
  TABLE_LEAD,
  hexToRgb,
  keyValuesLead,
  renderCode,
  renderKeyValues,
  renderTable,
  writeBullets,
  writeWrapped,
  type PdfBlock,
  type PdfSection,
} from './pdf-blocks';

/**
 * The house PDF: a centred cover block, a metadata table, numbered sections,
 * real bordered tables and a footer carrying the org, classification and page
 * numbers. Every PDF the platform generates uses it (ISMS documents, policies,
 * evidence reports, records, certificates). Mirrors the DOCX renderer.
 */
export function renderIsmsPdf({
  sections,
  metadata,
}: {
  sections: PdfSection[];
  metadata: IsmsExportMetadata;
}): Buffer {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const c = new PdfCursor(pdf, hexToRgb(metadata.primaryColor));

  drawCover(c, metadata);
  renderKeyValues(c, metadataRows(metadata), { labelWidth: 42, gap: 10, fontSize: 9 });
  for (const section of sections) renderSection(c, section);
  drawFooters(c, metadata);

  return Buffer.from(pdf.output('arraybuffer'));
}

function renderSection(c: PdfCursor, section: PdfSection): void {
  const { pdf } = c;
  // Headings keep the ISMS spacing after a table (section end already adds 4mm).
  c.afterTableGap = 0;
  const leadsWithText = Boolean(section.intro) || Boolean(section.paragraphs?.length) || Boolean(section.bullets?.length);
  const keyValues = section.keyValues?.length ? section.keyValues : undefined;
  const table = section.table?.rows.length ? section.table : undefined;
  const hasContent = leadsWithText || Boolean(keyValues) || Boolean(table) || Boolean(section.blocks?.length);
  const firstBlock: PdfBlock | undefined = keyValues
    ? { kind: 'keyValues', rows: keyValues }
    : table
      ? { kind: 'table', table }
      : section.blocks?.[0];

  if (section.heading) {
    // Keep the heading with the start of its content (a table header row, an image).
    c.ensureSpace(14 + (leadsWithText ? 0 : blockLeadHeight(c, firstBlock)));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...c.accent);
    for (const line of pdf.splitTextToSize(toPdfText(section.heading), c.contentWidth)) {
      pdf.text(line, c.margin, c.y);
      c.y += 6;
    }
    c.y += 1;
  }

  if (!hasContent) {
    // emptyText '' is a bare group heading: no blank line under it.
    const empty = section.emptyText ?? 'No entries recorded.';
    if (empty) writeWrapped(c, empty);
    c.y += empty ? 4 : 1;
    return;
  }

  if (section.intro) {
    writeWrapped(c, section.intro);
    c.y += 2;
  }
  for (const paragraph of section.paragraphs ?? []) {
    writeWrapped(c, paragraph.label ? `${paragraph.label}${paragraph.text}` : paragraph.text, {
      bold: paragraph.bold,
    });
    c.y += 1.5;
  }
  if (section.bullets?.length) writeBullets(c, { items: section.bullets });
  if (keyValues) renderKeyValues(c, keyValues);
  if (table) renderTable(c, table, { issueColumns: true });
  const blocks = section.blocks ?? [];
  blocks.forEach((block, index) => renderBlock(c, block, blocks[index + 1]));
  c.y += 4;
}

function drawCover(c: PdfCursor, metadata: IsmsExportMetadata): void {
  const { pdf } = c;
  const centerX = c.pageWidth / 2;
  c.y = 32;
  // Multi-line text advances by jsPDF's line height (fontSize * 1.15).
  const centred = (text: string, lineHeight: number): number => {
    const lines: string[] = pdf.splitTextToSize(toPdfText(text), c.contentWidth);
    pdf.text(lines, centerX, c.y, { align: 'center' });
    return (lines.length - 1) * lineHeight;
  };
  if (metadata.organizationName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...INK);
    c.y += centred(metadata.organizationName, 5.3) + 8;
  }
  if (metadata.standardLabel) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...MUTED);
    c.y += centred(metadata.standardLabel, 4.5);
  }
  c.y += 13;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(...c.accent);
  c.y += centred(metadata.title, 9) + 10;

  const subtitle = metadata.subtitle ?? `Clause ${metadata.clause}`;
  if (subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...MUTED);
    c.y += centred(subtitle, 4.5);
  }
  c.y += 13;
}

function drawFooters(c: PdfCursor, metadata: IsmsExportMetadata): void {
  const { pdf } = c;
  const pageCount = pdf.getNumberOfPages();
  const footerY = c.pageHeight - 9;
  const left = toPdfText([metadata.organizationName, metadata.classification].filter(Boolean).join('  ·  '));
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.setDrawColor(...HAIRLINE);
    pdf.setLineWidth(0.1);
    pdf.line(c.margin, footerY - 3, c.pageWidth - c.margin, footerY - 3);
    if (left) pdf.text(left, c.margin, footerY);
    pdf.text(toPdfText(`${metadata.documentCode}  ·  Page ${page} of ${pageCount}`), c.pageWidth - c.margin, footerY, {
      align: 'right',
    });
  }
}

/** Room a block needs on the page to start right under its heading or label (keep-with-next). */
function blockLeadHeight(c: PdfCursor, block: PdfBlock | undefined): number {
  if (block?.kind === 'table') return TABLE_LEAD;
  if (block?.kind === 'keyValues') return keyValuesLead(c, block.rows);
  if (block?.kind === 'code') return 13;
  if (block?.kind === 'image') return imageLeadHeight(c, block);
  return 0;
}

/** Keeps a label (subheading, bold or muted caption) on the page where the next block starts. */
function keepWithNext(c: PdfCursor, { text, bold, lead }: { text: string; bold: boolean; lead: number }): void {
  const { pdf } = c;
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(10.5);
  const lines = pdf.splitTextToSize(toPdfText(text), c.contentWidth).length;
  // A long paragraph flows normally; only short labels move with their content.
  if (lines <= 3) c.ensureSpace(c.afterTableGap + lines * 5 + 1.5 + lead);
}

function renderBlock(c: PdfCursor, block: PdfBlock, next: PdfBlock | undefined): void {
  switch (block.kind) {
    case 'subheading':
      keepWithNext(c, { text: block.text, bold: true, lead: Math.max(5.5, blockLeadHeight(c, next)) });
      writeWrapped(c, block.text, { bold: true });
      c.y += 1.5;
      return;
    case 'paragraph': {
      const lead = block.bold || block.muted ? blockLeadHeight(c, next) : 0;
      if (lead) keepWithNext(c, { text: block.text, bold: Boolean(block.bold), lead });
      writeWrapped(c, block.text, { bold: block.bold, color: block.muted ? MUTED : INK });
      c.y += 1.5;
      return;
    }
    case 'bullets':
      writeBullets(c, block);
      return;
    case 'keyValues':
      if (block.rows.length) renderKeyValues(c, block.rows);
      return;
    case 'table':
      if (block.table.rows.length) renderTable(c, block.table);
      return;
    case 'code':
      renderCode(c, block.text);
      return;
    case 'image':
      renderImage(c, block);
      return;
  }
}

type ImageBlock = Extract<PdfBlock, { kind: 'image' }>;

/** mm per PNG pixel below which 14 CSS px chart text (2x PNG) drops under ~6pt. */
const MIN_IMAGE_SCALE = 0.075;
/** A chart only this much too wide (~3.7pt text) is fitted to the page width rather than split sideways. */
const MIN_WIDTH_FIT_SCALE = 0.05;
/** Smallest slice of an oversized image worth starting at the bottom of a page. */
const MIN_IMAGE_BAND = 30;
/** Sideways strips repeat this much (mm) of their neighbour so no box is only ever seen cut. */
const STRIP_OVERLAP = 10;

/** Scale that fits the whole image on one page, else the scale it is tiled at (full-width bands when possible). */
function imageScale(c: PdfCursor, { width, height }: ImageBlock): { scale: number; whole: boolean } {
  const widthFit = c.contentWidth / width;
  const fit = Math.min(widthFit, (c.bottomLimit - c.margin) / height);
  if (fit >= MIN_IMAGE_SCALE || (fit === widthFit && fit >= MIN_WIDTH_FIT_SCALE)) return { scale: fit, whole: true };
  return { scale: widthFit >= MIN_WIDTH_FIT_SCALE ? Math.min(widthFit, MIN_IMAGE_SCALE) : MIN_IMAGE_SCALE, whole: false };
}

/** Smallest scale a whole image may shrink to (up to 40%) to stay on the current page. */
const shrinkFloor = (scale: number) => Math.max(Math.min(MIN_IMAGE_SCALE, scale), scale * 0.6);

/** First slice of a tiled image to keep together: all of it when it is no taller than a page. */
const firstBand = (c: PdfCursor, fullH: number) => (fullH <= c.bottomLimit - c.margin ? fullH : MIN_IMAGE_BAND);

function imageLeadHeight(c: PdfCursor, block: ImageBlock): number {
  const { scale, whole } = imageScale(c, block);
  return whole ? block.height * shrinkFloor(scale) + 2 : firstBand(c, block.height * scale);
}

function renderImage(c: PdfCursor, block: ImageBlock): void {
  const { pdf } = c;
  const { dataUrl, width, height } = block;
  const format = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
  const { scale, whole } = imageScale(c, block);
  if (whole) {
    const here = Math.min(scale, (c.bottomLimit - c.y - 2) / height);
    const use = here >= shrinkFloor(scale) ? here : scale;
    c.ensureSpace(height * use + 2);
    const w = width * use;
    pdf.addImage(dataUrl, format, c.margin + (c.contentWidth - w) / 2, c.y, w, height * use, undefined, 'FAST');
    c.y += height * use + 5;
    return;
  }
  // Too big for one page: bands flowing down the pages (like wrapped lines); jsPDF stores the image once.
  const fullW = width * scale;
  const fullH = height * scale;
  const stripW = Math.min(c.contentWidth, fullW);
  const strips = fullW <= c.contentWidth + 0.01 ? 1 : Math.ceil((fullW - STRIP_OVERLAP) / (c.contentWidth - STRIP_OVERLAP));
  // Equal full-width strips (no thin leftover), each sideways strip on its own page.
  const stride = strips > 1 ? (fullW - stripW) / (strips - 1) : 0;
  const x = c.margin + (c.contentWidth - stripW) / 2;
  for (let strip = 0; strip < strips; strip += 1) {
    if (strip > 0) c.newPage();
    const left = strip * stride;
    for (let top = 0; top < fullH; ) {
      if (c.bottomLimit - c.y < Math.min(firstBand(c, fullH), fullH - top)) c.newPage();
      const bandH = Math.min(c.bottomLimit - c.y, fullH - top);
      pdf.saveGraphicsState();
      pdf.rect(x, c.y, stripW, bandH, null);
      pdf.clip();
      pdf.discardPath();
      pdf.addImage(dataUrl, format, x - left, c.y - top, fullW, fullH, undefined, 'FAST');
      pdf.restoreGraphicsState();
      c.y += bandH;
      top += bandH;
    }
    c.y += 5;
  }
}
