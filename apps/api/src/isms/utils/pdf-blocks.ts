import type { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { toPdfText, type IsmsExportSection, type IsmsExportTable, type IsmsKeyValue } from './export-shared';

export type Rgb = [number, number, number];

export const INK: Rgb = [33, 33, 33];
export const MUTED: Rgb = [110, 110, 110];
export const HAIRLINE: Rgb = [223, 223, 223];
export const ZEBRA: Rgb = [247, 247, 247];

/**
 * Content rendered in the given order after a section's fixed fields — for
 * documents whose text interleaves paragraphs, lists and tables (policies,
 * evidence reports). PDF only; the DOCX renderer uses the fixed fields.
 */
export type PdfBlock =
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; text: string; bold?: boolean; muted?: boolean }
  | { kind: 'bullets'; items: string[]; ordered?: boolean; level?: number }
  | { kind: 'keyValues'; rows: IsmsKeyValue[] }
  | { kind: 'table'; table: IsmsExportTable }
  /** Monospace text (JSON output, logs); long lines wrap. */
  | { kind: 'code'; text: string }
  /** PNG/JPEG data URL; width/height give the aspect ratio, scaled to fit the page. */
  | { kind: 'image'; dataUrl: string; width: number; height: number };

/** A section of the house PDF; an empty heading renders no heading line. */
export type PdfSection = IsmsExportSection & { blocks?: PdfBlock[] };

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

export function hexToRgb(hex: string | null, fallback: Rgb = [0, 77, 61]): Rgb {
  if (!hex) return fallback;
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return [r, g, b];
}

/** Page cursor shared by the cover, sections and blocks of one document. */
export class PdfCursor {
  y: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly margin = 18;
  readonly contentWidth: number;
  readonly bottomLimit: number;
  /** Text drawn right after a table needs extra room: text is placed by its baseline. */
  afterTableGap = 0;

  constructor(
    readonly pdf: jsPDF,
    readonly accent: Rgb,
  ) {
    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.pageHeight = pdf.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.bottomLimit = this.pageHeight - 16;
    this.y = this.margin;
  }

  ensureSpace(needed: number): void {
    // At the top of a page already: a new page would only leave this one blank.
    if (this.y + needed > this.bottomLimit && this.y > this.margin) this.newPage();
  }

  newPage(): void {
    this.pdf.addPage();
    this.y = this.margin;
  }

  afterTable(gap: number): void {
    this.y = ((this.pdf as JsPdfWithAutoTable).lastAutoTable?.finalY ?? this.y) + gap;
    this.afterTableGap = 3;
  }

  /** Call before drawing text; adds the post-table gap once. */
  beforeText(): void {
    this.y += this.afterTableGap;
    this.afterTableGap = 0;
  }
}

export function writeWrapped(
  c: PdfCursor,
  text: string,
  { bold = false, color = INK, indent = 0 }: { bold?: boolean; color?: Rgb; indent?: number } = {},
): void {
  const { pdf } = c;
  c.beforeText();
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...color);
  for (const line of pdf.splitTextToSize(toPdfText(text), c.contentWidth - indent)) {
    c.ensureSpace(6);
    pdf.text(line, c.margin + indent, c.y);
    c.y += 5;
  }
}

function writeBullet(c: PdfCursor, { text, marker, indent }: { text: string; marker: string; indent: number }): void {
  const { pdf } = c;
  c.beforeText();
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...INK);
  const lines = pdf.splitTextToSize(toPdfText(text), c.contentWidth - indent - 6);
  lines.forEach((line: string, index: number) => {
    c.ensureSpace(6);
    if (index === 0) pdf.text(marker, c.margin + indent + 1, c.y);
    pdf.text(line, c.margin + indent + 6, c.y);
    c.y += 5;
  });
  c.y += 1;
}

export function writeBullets(c: PdfCursor, { items, ordered = false, level = 0 }: { items: string[]; ordered?: boolean; level?: number }): void {
  items.forEach((text, index) =>
    writeBullet(c, { text, marker: ordered ? `${index + 1}.` : '•', indent: level * 6 }),
  );
}

interface KeyValueOptions {
  labelWidth?: number;
  gap?: number;
  fontSize?: number;
}

const CELL_PADDING = 2.2;

/** Splits tokens wider than `width` after '@', '.', '-' or '/' (not at an arbitrary letter). */
function breakLongTokens(pdf: jsPDF, text: string, width: number): string {
  return text.replace(/\S+/g, (token) => {
    const parts: string[] = [];
    let rest = token;
    while (pdf.getTextWidth(rest) > width) {
      let fit = 1;
      while (fit < rest.length && pdf.getTextWidth(rest.slice(0, fit + 1)) <= width) fit += 1;
      const soft = Math.max(...['@', '.', '-', '/'].map((ch) => rest.lastIndexOf(ch, fit - 1)));
      const cut = soft > 0 ? soft + 1 : fit;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    return [...parts, rest].join('\n');
  });
}

function keyValueBody(c: PdfCursor, rows: IsmsKeyValue[], { labelWidth = 48, fontSize = 9.5 }: KeyValueOptions): string[][] {
  c.pdf.setFont('helvetica', 'normal');
  c.pdf.setFontSize(fontSize);
  const valueWidth = c.contentWidth - labelWidth - CELL_PADDING * 2 - 0.5;
  return rows.map((row) => [toPdfText(row.label), breakLongTokens(c.pdf, toPdfText(row.value), valueWidth)]);
}

/** Height of a key/value table (whole when it has 4 rows or fewer, else its first row): keeps short tables in one piece. */
export function keyValuesLead(c: PdfCursor, rows: IsmsKeyValue[], options: KeyValueOptions = {}): number {
  const { labelWidth = 48, fontSize = 9.5 } = options;
  const { pdf } = c;
  const lineHeight = (fontSize * 1.15 * 25.4) / 72;
  const body = keyValueBody(c, rows, options).slice(0, rows.length <= 4 ? rows.length : 1);
  return body.reduce((total, [label, value]) => {
    pdf.setFont('helvetica', 'bold');
    const labelLines = pdf.splitTextToSize(label, labelWidth - CELL_PADDING * 2).length;
    pdf.setFont('helvetica', 'normal');
    const valueLines = pdf.splitTextToSize(value, c.contentWidth - labelWidth - CELL_PADDING * 2).length;
    return total + Math.max(labelLines, valueLines) * lineHeight + CELL_PADDING * 2;
  }, 0);
}

/** Grey-label key/value table (the cover metadata table uses fontSize 9, labelWidth 42). */
export function renderKeyValues(c: PdfCursor, rows: IsmsKeyValue[], options: KeyValueOptions = {}): void {
  const { labelWidth = 48, gap = 4, fontSize = 9.5 } = options;
  c.ensureSpace(keyValuesLead(c, rows, options));
  autoTable(c.pdf, {
    startY: c.y,
    margin: { left: c.margin, right: c.margin, bottom: 16 },
    theme: 'grid',
    rowPageBreak: 'avoid',
    styles: { fontSize, cellPadding: CELL_PADDING, lineColor: HAIRLINE, lineWidth: 0.1, textColor: INK, valign: 'top', overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: labelWidth, fontStyle: 'bold', fillColor: ZEBRA, textColor: MUTED },
      1: { cellWidth: c.contentWidth - labelWidth },
    },
    body: keyValueBody(c, rows, options),
  });
  c.afterTable(gap);
}

/** Cell text up to this wide (mm) is kept unwrapped when the table has room. */
const SHORT_CELL = 25;

function longestWord(c: PdfCursor, text: string): number {
  return text.split(/\s+/).reduce((max, word) => Math.max(max, c.pdf.getTextWidth(word)), 0);
}

/**
 * Column floors so words never break mid-word ("Acceptanc/e", "employe/e"):
 * autotable drops its own longest-word floor as soon as one unbreakable token
 * (an email, a resource id) makes the table too wide. Body tokens are capped so
 * one of them cannot starve the other columns.
 */
function columnFloors(c: PdfCursor, headers: string[], rows: string[][]): Record<number, { minCellWidth: number }> {
  const { pdf } = c;
  const padding = 2.2 * 2 + 0.5;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  const headerFloors = headers.map((header) => longestWord(c, header) + padding);
  pdf.setFont('helvetica', 'normal');
  const bodyFloors = headers.map((_, index) => Math.max(0, ...rows.map((row) => longestWord(c, row[index] ?? '') + padding)));
  const shortFloors = headers.map((_, index) =>
    Math.max(0, ...rows.map((row) => pdf.getTextWidth(row[index] ?? '')).filter((width) => width <= SHORT_CELL)) + padding,
  );
  const floorsAt = (cap: number) => headerFloors.map((width, index) => Math.max(width, Math.min(cap, bodyFloors[index])));
  const fits = (cap: number) => floorsAt(cap).reduce((total, width) => total + width, 0) <= c.contentWidth;
  // Too many long words to fit: the longest give way first; header words stay whole.
  let cap = Math.min(45, (c.contentWidth / headers.length) * 1.5);
  while (cap > 0 && !fits(cap)) cap -= 0.5;
  // Short multi-word cells ("Role 1") stay on one line when every column still fits.
  const raised = floorsAt(cap).map((width, index) => Math.max(width, shortFloors[index]));
  const floors = raised.reduce((total, width) => total + width, 0) <= c.contentWidth ? raised : floorsAt(cap);
  return Object.fromEntries(floors.map((minCellWidth, index) => [index, { minCellWidth }]));
}

/** `issueColumns`: the ISMS category/issue/effect layout (fixed 32/56/rest widths). */
export function renderTable(
  c: PdfCursor,
  table: IsmsExportTable,
  { issueColumns = false }: { issueColumns?: boolean } = {},
): void {
  const { pdf } = c;
  const threeCol = issueColumns && table.headers.length === 3;
  const cellFills = table.cellFills;
  c.ensureSpace(TABLE_LEAD);
  const headers = table.headers.map(toPdfText);
  const rows = table.rows.map((row) => row.map(toPdfText));
  autoTable(pdf, {
    startY: c.y,
    margin: { left: c.margin, right: c.margin, bottom: 16 },
    theme: 'grid',
    rowPageBreak: 'avoid',
    head: [headers],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: HAIRLINE, lineWidth: 0.1, textColor: INK, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: c.accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    columnStyles: threeCol
      ? { 0: { cellWidth: 32, fontStyle: 'bold' }, 1: { cellWidth: 56 }, 2: { cellWidth: c.contentWidth - 88 } }
      : table.columnWidths
        ? Object.fromEntries(table.columnWidths.map((cellWidth, index) => [index, { cellWidth }]))
        : columnFloors(c, headers, rows),
    // Per-cell light fills (the 6.1.2 risk matrix); ink text stays legible.
    didParseCell: cellFills
      ? (data) => {
          if (data.section !== 'body') return;
          const fill = cellFills[data.row.index]?.[data.column.index];
          if (fill) data.cell.styles.fillColor = hexToRgb(fill);
        }
      : undefined,
  });
  c.afterTable(4);
}

export function renderCode(c: PdfCursor, text: string): void {
  const { pdf } = c;
  c.beforeText();
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...INK);
  const lines: string[] = pdf.splitTextToSize(toPdfText(text), c.contentWidth - 6);
  for (const line of lines) {
    c.ensureSpace(5);
    pdf.setFillColor(...ZEBRA);
    pdf.rect(c.margin, c.y - 3.2, c.contentWidth, 4.2, 'F');
    pdf.text(line, c.margin + 3, c.y);
    c.y += 4.2;
  }
  c.y += 3;
}

/** A table's header row plus a two-line body row: never leave the header alone at a page bottom. */
export const TABLE_LEAD = 18;
