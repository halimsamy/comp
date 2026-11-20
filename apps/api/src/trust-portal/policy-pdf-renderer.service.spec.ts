import { PDFDocument } from 'pdf-lib';
import { pdfText } from '../tasks/evidence-export/pdf-text.test-util';
import { PolicyPdfRendererService } from './policy-pdf-renderer.service';

/** Text drawn by jsPDF (one `(...) Tj` per line or run). */
function drawnText(pdf: Buffer): string[] {
  return [...pdfText(pdf).matchAll(/\((.*?)\)\s*Tj/g)].map((m) => m[1]);
}

const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

const content = [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Purpose' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'We respect your privacy.' }] },
];

const documentControl = [
  { label: 'Policy owner', value: 'Jane Doe' },
  { label: 'Version', value: 'v3' },
  { label: 'Classification', value: 'Internal - all employees' },
];

describe('PolicyPdfRendererService', () => {
  const service = new PolicyPdfRendererService();

  it('renders one policy as a house document with its document control on the cover', () => {
    const pdf = service.renderPoliciesPdfBuffer(
      [{ name: 'Access Control Policy', content, documentControl }],
      'Acme',
      '#3B82F6',
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = drawnText(pdf);
    expect(text).toEqual(
      expect.arrayContaining([
        'Acme',
        'Policy',
        'Access Control Policy',
        'POL-ACP-v3',
        'Jane Doe',
        '1. Purpose',
        'We respect your privacy.',
      ]),
    );
    expect(text.some((t) => t.includes('Internal - all employees') && t.includes('Acme'))).toBe(true);
    expect(text.some((t) => t.includes('POL-ACP-v3') && t.includes('Page 1 of 1'))).toBe(true);
  });

  it('appends the revision history as a numbered table section', () => {
    const pdf = service.renderPoliciesPdfBuffer([
      {
        name: 'Access Control Policy',
        content,
        revisions: [{ version: 'v2', date: 'May 1, 2026', approvedBy: 'Jane Doe', changes: 'Initial' }],
      },
    ]);

    expect(drawnText(pdf)).toEqual(expect.arrayContaining(['2. Revision history', 'Changes', 'Initial']));
  });

  it('prints "No approved versions yet." for an empty revision history and omits it when not given', () => {
    const empty = drawnText(service.renderPoliciesPdfBuffer([{ name: 'Access Control Policy', content, revisions: [] }]));
    expect(empty).toEqual(expect.arrayContaining(['2. Revision history', 'No approved versions yet.']));

    const omitted = drawnText(service.renderPoliciesPdfBuffer([{ name: 'Access Control Policy', content }]));
    expect(omitted).not.toContain('2. Revision history');
  });

  it('shows the version and status as the cover subtitle and in the Version row', () => {
    const text = drawnText(
      service.renderPoliciesPdfBuffer([{ name: 'Access Control Policy', content, documentControl, status: 'needs_review' }]),
    );
    expect(text.filter((t) => t === 'v3 \u00b7 Needs review')).toHaveLength(2);
    expect(text).toContain('POL-ACP-v3');
  });

  it('uses the shared policy classification on the bundle cover footer', async () => {
    const bundle = await service.renderPolicyBundlePdf({
      policies: [
        { id: 'pol_a', name: 'Policy A', content, documentControl },
        { id: 'pol_b', name: 'Policy B', content, documentControl },
      ],
      organizationName: 'Acme',
      primaryColor: null,
    });
    const text = drawnText(bundle);
    expect(text.some((t) => t.includes('POL-BUNDLE'))).toBe(true);
    expect(text.some((t) => t.includes('Confidential'))).toBe(false);
  });

  it('renders empty and malformed (imported) content without throwing', () => {
    for (const value of [null, 'text', { content: 'not-an-array' }]) {
      const pdf = service.renderPoliciesPdfBuffer([{ name: 'Imported', content: value }], 'Acme');
      expect(drawnText(pdf)).toContain('Imported');
    }
  });

  it('groups several policies under their names in one document', () => {
    const pdf = service.renderPoliciesPdfBuffer(
      [
        { name: 'Policy A', content, documentControl },
        { name: 'Policy B', content },
      ],
      'Acme',
      null,
      7,
    );

    expect(drawnText(pdf)).toEqual(expect.arrayContaining(['Policies', 'Policy A', 'Policy B', '7']));
  });

  describe('renderPolicyBundlePdf', () => {
    it('merges a contents cover and one house document per policy', async () => {
      const single = service.renderPoliciesPdfBuffer([{ name: 'Policy A', content }], 'Acme');
      const bundle = await service.renderPolicyBundlePdf({
        policies: [
          { id: 'pol_a', name: 'Policy A', content },
          { id: 'pol_b', name: 'Policy B', content },
        ],
        organizationName: 'Acme',
        primaryColor: null,
      });

      expect(await pageCount(bundle)).toBe(1 + 2 * (await pageCount(single)));
    });

    it('puts a cover page before an uploaded PDF and keeps its pages unchanged', async () => {
      const uploaded = await PDFDocument.create();
      uploaded.addPage();
      uploaded.addPage();
      const bundle = await service.renderPolicyBundlePdf({
        policies: [{ id: 'pol_a', name: 'Policy A', content, uploadedPdf: Buffer.from(await uploaded.save()) }],
        organizationName: 'Acme',
        primaryColor: null,
      });

      expect(await pageCount(bundle)).toBe(3);
    });

    it('falls back to the content when an uploaded PDF cannot be parsed', async () => {
      const bundle = await service.renderPolicyBundlePdf({
        policies: [{ id: 'pol_a', name: 'Policy A', content, uploadedPdf: Buffer.from('not a pdf') }],
        organizationName: 'Acme',
        primaryColor: null,
      });

      expect(await pageCount(bundle)).toBe(1);
    });
  });
});
