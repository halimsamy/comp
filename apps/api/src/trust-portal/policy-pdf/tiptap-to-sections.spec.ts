import { tiptapToSections } from './tiptap-to-sections';

const text = (value: string, marks?: string[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const heading = (level: number, value: string) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const list = (type: 'bulletList' | 'orderedList', ...items: object[][]) => ({
  type,
  content: items.map((content) => ({ type: 'listItem', content })),
});
const cell = (type: 'tableCell' | 'tableHeader', value: string, attrs?: object) => ({
  type,
  ...(attrs ? { attrs } : {}),
  content: [paragraph(text(value))],
});

describe('tiptapToSections', () => {
  it('numbers the shallowest headings as sections and the next level as subheadings', () => {
    const sections = tiptapToSections([
      paragraph(text('Intro before any heading')),
      heading(2, 'Purpose'),
      paragraph(text('Why')),
      heading(2, 'Scope'),
      heading(3, 'Systems'),
      heading(4, 'Detail'),
      heading(2, '3. Already numbered'),
    ]);

    expect(sections.map((s) => s.heading)).toEqual(['', '1. Purpose', '2. Scope', '3. Already numbered']);
    expect(sections[0].blocks).toEqual([{ kind: 'paragraph', text: 'Intro before any heading' }]);
    expect(sections[2].blocks).toEqual([
      { kind: 'subheading', text: '2.1 Systems' },
      { kind: 'subheading', text: 'Detail' },
    ]);
  });

  it('flattens marks, keeps hard breaks and marks all-bold paragraphs bold', () => {
    const [section] = tiptapToSections({
      type: 'doc',
      content: [
        paragraph(text('Line one', ['italic']), { type: 'hardBreak' }, text('line two', ['link'])),
        paragraph(text('Owner:', ['bold']), text(' ')),
        paragraph(text('Mixed ', ['bold']), text('text')),
        paragraph(),
      ],
    });

    expect(section.blocks).toEqual([
      { kind: 'paragraph', text: 'Line one\nline two' },
      { kind: 'paragraph', text: 'Owner:', bold: true },
      { kind: 'paragraph', text: 'Mixed text' },
    ]);
  });

  it('renders each list item once and nested lists as their own indented blocks', () => {
    const [section] = tiptapToSections([
      list(
        'bulletList',
        [paragraph(text('Grant access')), paragraph(text('on request')), list('orderedList', [paragraph(text('Approved by owner'))])],
        [paragraph(text('Revoke access'))],
      ),
    ]);

    expect(section.blocks).toEqual([
      { kind: 'bullets', items: ['Grant access on request'], ordered: false, level: 0 },
      { kind: 'bullets', items: ['Approved by owner'], ordered: true, level: 1 },
      { kind: 'bullets', items: ['Revoke access'], ordered: false, level: 0 },
    ]);
  });

  it('keeps ordered numbering by folding nested lists into the ordered item', () => {
    const [section] = tiptapToSections([
      list(
        'orderedList',
        [paragraph(text('First step')), list('bulletList', [paragraph(text('Detail'))])],
        [paragraph(text('Second step'))],
      ),
    ]);

    expect(section.blocks).toEqual([
      { kind: 'bullets', items: ['First step\n• Detail', 'Second step'], ordered: true, level: 0 },
    ]);
  });

  it('converts tables, keeping multi-paragraph cells and list markers on their own lines', () => {
    const [section] = tiptapToSections([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Data'), cell('tableHeader', 'Retention')] },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [paragraph(text('Logs')), paragraph(text('Audit'))] },
              { type: 'tableCell', content: [list('orderedList', [paragraph(text('30 days'))], [paragraph(text('1 year'))])] },
            ],
          },
          { type: 'tableRow', content: [cell('tableCell', 'Spans both', { colspan: 2 })] },
        ],
      },
      { type: 'table', content: [] },
    ]);

    expect(section.blocks).toEqual([
      {
        kind: 'table',
        table: {
          headers: ['Data', 'Retention'],
          rows: [
            ['Logs\nAudit', '1. 30 days\n2. 1 year'],
            ['Spans both', ''],
          ],
        },
      },
    ]);
  });

  it('renders code blocks as code and blockquotes muted', () => {
    const [section] = tiptapToSections([
      { type: 'codeBlock', content: [text('{ "a": 1 }')] },
      { type: 'blockquote', content: [paragraph(text('Quoted'))] },
      { type: 'horizontalRule' },
    ]);

    expect(section.blocks).toEqual([
      { kind: 'code', text: '{ "a": 1 }' },
      { kind: 'paragraph', text: 'Quoted', muted: true },
    ]);
  });

  it('strips emoji, keeping accents, curly quotes and dashes', () => {
    const [section] = tiptapToSections([heading(2, '🔒 Security'), paragraph(text('“Café” — naïve ✅'))]);

    expect(section.heading).toBe('1. Security');
    expect(section.blocks).toEqual([{ kind: 'paragraph', text: '“Café” — naïve' }]);
  });

  it('returns no sections for malformed or empty content instead of throwing', () => {
    expect(tiptapToSections(null)).toEqual([]);
    expect(tiptapToSections('plain string')).toEqual([]);
    expect(tiptapToSections({ type: 'doc', content: 'not-an-array' })).toEqual([]);
    expect(
      tiptapToSections([{ type: 'paragraph', content: { text: 'object' } }, { type: 'bulletList', content: 'x' }]),
    ).toEqual([]);
  });
});
