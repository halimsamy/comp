import { jsPDF } from 'jspdf';
import { inflateSync } from 'node:zlib';
import { toPdfText } from './export-shared';
import { renderHousePdf } from '../../utils/house-pdf';

// 1x1 PNG; the block's width/height (not the pixels) drive the layout.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

function render(sections: Parameters<typeof renderHousePdf>[0]['sections']): Buffer {
  return renderHousePdf({ title: 'Sample', documentCode: 'X', organizationName: 'Acme', primaryColor: null, rows: [{ label: 'Document ID', value: 'X' }], sections });
}

describe('toPdfText', () => {
  it('maps characters outside WinAnsi and keeps everything else', () => {
    expect(toPdfText('≥ 95% → ✓ “ok” – café • €5')).toBe('>= 95% -> v “ok” – café • €5');
    expect(toPdfText('a​b c 🚀 漢')).toBe('ab c  ?');
  });

  it('keeps a paragraph with ≥ on WinAnsi lines within the content width', () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    const text = toPdfText('Coverage ≥ 95% of in-scope members, and ≥ characters test glyphs at the very end.');
    const lines: string[] = pdf.splitTextToSize(text, 60);
    expect(lines.join(' ')).toContain('characters test glyphs at the very end.');
    for (const line of lines) expect(pdf.getTextWidth(line)).toBeLessThanOrEqual(60);
  });
});

describe('house PDF images', () => {
  it('fits a normal image on the first page', () => {
    const pdf = render([{ heading: '1. Chart', blocks: [{ kind: 'image', dataUrl: PIXEL, width: 960, height: 563 }] }]);
    expect(pageCount(pdf)).toBe(1);
  });

  it('tiles an image too wide to read when fitted to one page', () => {
    const pdf = render([{ heading: '1. Chart', blocks: [{ kind: 'image', dataUrl: PIXEL, width: 8920, height: 2400 }] }]);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});

/** Text drawn on each page, from the inflated page content streams (every page has a footer). */
function pageTexts(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1');
  const pages: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let content = '';
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    if (!content.includes(' Tj')) continue;
    pages.push([...content.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((tj) => tj[1].replace(/\\(.)/g, '$1')).join('\n'));
  }
  return pages;
}

/** Page (1-based) each needle is first drawn on. */
function pagesOf(sections: Parameters<typeof render>[0], needles: string[]): Record<string, number> {
  const texts = pageTexts(render(sections));
  for (const needle of needles) expect(texts.some((text) => text.includes(needle))).toBe(true);
  return Object.fromEntries(needles.map((needle) => [needle, texts.findIndex((text) => text.includes(needle)) + 1]));
}

const filler = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'paragraph' as const, text: `Filler ${i}` }));

describe('house PDF page flow', () => {
  it('fits a moderately wide chart (5 boxes across) on one page at full content width', () => {
    // addImage lives on jsPDF.API at runtime, but its typings omit it there.
    const api = jsPDF.API as unknown as { addImage: (...args: unknown[]) => unknown };
    const spy = jest.spyOn(api, 'addImage');
    const pdf = render([{ heading: '1. Chart', blocks: [{ kind: 'image', dataUrl: PIXEL, width: 2480, height: 1248 }] }]);
    expect(pageCount(pdf)).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][4]).toBeCloseTo(174, 1);
    spy.mockRestore();
  });

  it.each([24, 25, 26, 27, 28])('keeps a label with the table, code or answer after it (%i filler lines)', (n) => {
    const sub = '1.4 A question long enough that its heading wraps over two lines of the page, so it needs more room than one line?';
    const pages = pagesOf(
      [
        { heading: '1. Results', blocks: [...filler(n), { kind: 'paragraph', text: 'Results (1)', bold: true }, { kind: 'table', table: { headers: ['Resource'], rows: [['bucket']] } }] },
        { heading: '2. Logs', blocks: [...filler(n), { kind: 'paragraph', text: 'Evidence: x', muted: true }, { kind: 'code', text: 'log-line' }] },
        { heading: '3. Q', blocks: [...filler(n), { kind: 'subheading', text: sub }, { kind: 'paragraph', text: 'Answer here' }] },
      ],
      ['Results (1)', 'Resource', 'Evidence: x', 'log-line', '1.4 A question', 'Answer here'],
    );
    expect(pages['Results (1)']).toBe(pages.Resource);
    expect(pages['Evidence: x']).toBe(pages['log-line']);
    expect(pages['1.4 A question']).toBe(pages['Answer here']);
  });

  it.each([20, 21, 22, 23, 24])('keeps a short key/value table in one piece (%i filler lines)', (n) => {
    const rows = [
      { label: 'Name', value: 'Maximiliana Wolfeschlegelsteinhausenbergerdorff' },
      { label: 'Email', value: 'maximiliana.wolfeschlegelsteinhausenbergerdorff@very-long-company-name.example.co.uk' },
      { label: 'Signed', value: '20 Nov 2026' },
    ];
    const pages = pagesOf([{ heading: '1. Terms', blocks: filler(n) }, { heading: '5. Party', keyValues: rows }], ['5. Party', 'Name', 'Signed']);
    expect(pages.Name).toBe(pages['5. Party']);
    expect(pages.Signed).toBe(pages.Name);
  });

  it('breaks a long email after a separator, not mid-word', () => {
    const pdf = render([{ heading: '1. Party', keyValues: [{ label: 'Email', value: 'maximiliana.wolfeschlegelsteinhausenbergerdorff@very-long-company-name.example.co.uk' }] }]);
    const first = pageTexts(pdf)[0].split('\n').find((line) => line.startsWith('maximiliana'));
    expect(first).toMatch(/[@.\-/]$/);
  });
});
