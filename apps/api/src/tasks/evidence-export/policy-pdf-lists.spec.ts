import { PolicyPdfRendererService } from '../../trust-portal/policy-pdf-renderer.service';
import { pdfText } from './pdf-text.test-util';

/** Text drawn by jsPDF (one `(...) Tj` per line or run). */
function drawnText(pdf: Buffer): string[] {
  return [...pdfText(pdf).matchAll(/\((.*?)\)\s*Tj/g)].map((m) => m[1]);
}

describe('policy PDF lists (export policy renderer)', () => {
  it('renders each list item once, without its nested list glued on, with paragraphs spaced', () => {
    const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const pdf = new PolicyPdfRendererService().renderPoliciesPdfBuffer([
      {
        name: 'Access Control Policy',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  paragraph('Grant access'),
                  paragraph('on request'),
                  {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [paragraph('Approved by owner')] }],
                  },
                ],
              },
            ],
          },
        ],
        documentControl: [{ label: 'Version', value: 'v3' }],
      },
    ]);

    const text = drawnText(pdf);
    expect(text).toContain('Grant access on request');
    expect(text.filter((t) => t.includes('Approved by owner'))).toHaveLength(1);
    expect(text.some((t) => t.includes('Grant accesson request'))).toBe(false);
    expect(text).toContain('v3');
  });
});
