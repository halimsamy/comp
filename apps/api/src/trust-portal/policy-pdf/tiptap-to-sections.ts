import type { PdfBlock, PdfSection } from '../../utils/house-pdf';
import { cleanTextForPdf } from './pdf-text';

/** A TipTap/ProseMirror JSON node as stored in policy content (untrusted shape). */
interface TipTapNode {
  type?: unknown;
  attrs?: { level?: unknown; colspan?: unknown };
  content?: unknown;
  text?: unknown;
  marks?: unknown;
}

type Push = (block: PdfBlock) => void;

const isNode = (value: unknown): value is TipTapNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Imported / non-TipTap content (e.g. Drata migrations) can carry a string or
 * object where an array is expected; treat anything else as no children so a
 * single malformed policy never breaks a whole bundle.
 */
const children = (node: unknown): TipTapNode[] => {
  const content = isNode(node) ? node.content : node;
  return Array.isArray(content) ? content.filter(isNode) : [];
};

const isList = (node: TipTapNode) => node.type === 'bulletList' || node.type === 'orderedList';

/** Inline text with marks flattened; hard breaks become newlines. */
function inlineText(nodes: TipTapNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      if (typeof node.text === 'string') return node.text;
      return inlineText(children(node));
    })
    .join('');
}

/** Text of a block inside a list item or table cell; nested lists keep their markers. */
function blockText(node: TipTapNode): string {
  if (isList(node)) {
    return children(node)
      .map((item, index) => {
        const body = children(item).map(blockText).filter(Boolean).join('\n');
        if (!body) return '';
        return `${node.type === 'orderedList' ? `${index + 1}.` : '•'} ${body}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (node.type === 'listItem') return children(node).map(blockText).filter(Boolean).join('\n');
  if (node.type === 'hardBreak') return '\n';
  if (typeof node.text === 'string') return node.text;
  return children(node).map(blockText).join('');
}

const hasMark = (node: TipTapNode, mark: string) =>
  Array.isArray(node.marks) && node.marks.some((m) => isNode(m) && m.type === mark);

function paragraphBlock(node: TipTapNode, muted: boolean): PdfBlock | null {
  const text = cleanTextForPdf(inlineText(children(node))).trim();
  if (!text) return null;
  const runs = children(node).filter((child) => typeof child.text === 'string' && child.text.trim());
  const bold = runs.length > 0 && runs.every((run) => hasMark(run, 'bold'));
  return { kind: 'paragraph', text, bold: bold || undefined, muted: muted || undefined };
}

/** A list becomes one bullets block per run of items; nested lists render indented in between. */
function listBlocks(list: TipTapNode, level: number, push: Push): void {
  const ordered = list.type === 'orderedList';
  let items: string[] = [];
  const flush = () => {
    if (items.length) push({ kind: 'bullets', items, ordered, level });
    items = [];
  };
  for (const item of children(list)) {
    const parts = children(item);
    const own = parts.filter((part) => !isList(part)).map(blockText).filter(Boolean).join(' ');
    // shortcut: an ordered item keeps its nested lists inside its own text (marker
    // lines under it) because a split block would restart the numbering at 1;
    // render them as indented blocks once the bullets block takes a start number.
    const nestedText = ordered ? parts.filter(isList).map(blockText).filter(Boolean) : [];
    const text = cleanTextForPdf([own, ...nestedText].filter(Boolean).join('\n')).trim();
    if (text) items.push(text);
    if (ordered) continue;
    for (const nested of parts.filter(isList)) {
      flush();
      listBlocks(nested, level + 1, push);
    }
  }
  flush();
}

function cellSpan(cell: TipTapNode): number {
  const span = cell.attrs?.colspan;
  return typeof span === 'number' && span > 1 ? Math.floor(span) : 1;
}

function tableBlock(table: TipTapNode): PdfBlock | null {
  const rows = children(table)
    .filter((row) => row.type === 'tableRow')
    .map((row) =>
      children(row)
        .filter((cell) => cell.type === 'tableCell' || cell.type === 'tableHeader')
        .flatMap((cell) => {
          const text = cleanTextForPdf(children(cell).map(blockText).filter(Boolean).join('\n'));
          // shortcut: a colspan cell is padded with empty cells (the house table has no spans).
          return [text, ...Array<string>(cellSpan(cell) - 1).fill('')];
        }),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((row) => row.length));
  const [headers, ...body] = rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]);
  // The house table always has a header row; a header-less table promotes its first row.
  return { kind: 'table', table: { headers, rows: body.length ? body : [headers.map(() => '')] } };
}

function appendBlocks(node: TipTapNode, push: Push, muted = false): void {
  switch (node.type) {
    case 'paragraph': {
      const block = paragraphBlock(node, muted);
      if (block) push(block);
      return;
    }
    case 'heading': {
      const text = cleanTextForPdf(inlineText(children(node))).trim();
      if (text) push({ kind: 'subheading', text });
      return;
    }
    case 'bulletList':
    case 'orderedList':
      listBlocks(node, 0, push);
      return;
    case 'codeBlock': {
      const text = cleanTextForPdf(inlineText(children(node)));
      if (text.trim()) push({ kind: 'code', text });
      return;
    }
    case 'blockquote':
      for (const child of children(node)) appendBlocks(child, push, true);
      return;
    case 'table': {
      const block = tableBlock(node);
      if (block) push(block);
      return;
    }
    case 'hardBreak':
    case 'horizontalRule':
      return;
    default:
      if (typeof node.text === 'string' && node.text.trim()) {
        push({ kind: 'paragraph', text: cleanTextForPdf(node.text).trim(), muted: muted || undefined });
        return;
      }
      for (const child of children(node)) appendBlocks(child, push, muted);
  }
}

const ALREADY_NUMBERED = /^\d+(\.\d+)*[.)]?\s/;
const numbered = (prefix: string, text: string) => (ALREADY_NUMBERED.test(text) ? text : `${prefix} ${text}`);

function headingLevel(node: TipTapNode): number {
  const level = node.attrs?.level;
  return typeof level === 'number' ? level : 1;
}

/**
 * Policy TipTap JSON → house PDF sections. The shallowest heading level
 * becomes a numbered section ("2. Scope"), the next level a numbered
 * subheading ("2.1 …"), deeper headings plain subheadings. Content before
 * the first heading lands in an unheaded section.
 */
export function tiptapToSections(content: unknown): PdfSection[] {
  // Policy content is a node array (jsonb[]) or a `{ type: 'doc', content }` object.
  const nodes = children(content).flatMap((node) => (node.type === 'doc' ? children(node) : [node]));
  const levels = nodes.filter((node) => node.type === 'heading').map(headingLevel);
  const top = levels.length ? Math.min(...levels) : 1;

  const sections: PdfSection[] = [];
  let current: PdfSection = { heading: '', blocks: [], emptyText: '' };
  let sectionNumber = 0;
  let subNumber = 0;
  const push: Push = (block) => current.blocks?.push(block);

  for (const node of nodes) {
    if (node.type !== 'heading') {
      appendBlocks(node, push);
      continue;
    }
    const text = cleanTextForPdf(inlineText(children(node))).trim();
    if (!text) continue;
    const level = headingLevel(node);
    if (level <= top) {
      if (current.heading || current.blocks?.length) sections.push(current);
      sectionNumber += 1;
      subNumber = 0;
      current = { heading: numbered(`${sectionNumber}.`, text), blocks: [], emptyText: '' };
    } else if (level === top + 1 && sectionNumber > 0) {
      subNumber += 1;
      push({ kind: 'subheading', text: numbered(`${sectionNumber}.${subNumber}`, text) });
    } else {
      push({ kind: 'subheading', text });
    }
  }
  if (current.heading || current.blocks?.length) sections.push(current);
  return sections;
}
