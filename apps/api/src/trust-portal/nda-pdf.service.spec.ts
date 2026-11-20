import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'zlib';
import type { AttachmentsService } from '../attachments/attachments.service';
import { NdaPdfService } from './nda-pdf.service';

/** The house renderer compresses its content streams: inflate them so text can be asserted. */
const pdfTextOf = (pdf: Buffer): string =>
  pdf.toString('latin1').replace(/stream\r?\n([\s\S]*?)endstream/g, (whole, body: string) => {
    try {
      return inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    } catch {
      return whole;
    }
  });

/** pdf-lib writes drawText strings as hex: match them that way. */
const hexOf = (text: string): string => Buffer.from(text, 'latin1').toString('hex').toUpperCase();

describe('NdaPdfService', () => {
  const service = new NdaPdfService({} as AttachmentsService);

  it('generates a house-style NDA with the signer details and watermark', async () => {
    const result = await service.generateNdaPdf({
      organizationName: 'Acme Corp',
      signerName: 'Jane Doe',
      signerEmail: 'jane@example.com',
      agreementId: 'nda-1234-abcdef123456',
    });

    expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(result);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    const text = pdfTextOf(result);
    expect(text).toContain('Non-Disclosure Agreement');
    expect(text).toContain('Jane Doe');
    expect(text).toContain('jane@example.com');
    expect(text).toContain('NDA-ABCDEF12');
    expect(text).toContain('two \\(2\\) years');
  });

  it('prints ISO dates in UTC', async () => {
    // Fake only the clock; faked timers stall the PDF renderer.
    jest.useFakeTimers({
      now: new Date('2026-11-20T12:46:19Z'),
      doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'],
    });
    try {
      const text = pdfTextOf(
        await service.generateNdaPdf({
          organizationName: 'Acme Corp',
          signerName: 'Jane Doe',
          signerEmail: 'jane@example.com',
          agreementId: 'tna_6afdeb9edece020b0a2b0ee1',
        }),
      );
      expect(text).toContain('2026-11-20 12:46 UTC');
      expect(text).not.toContain('11/20/2026');
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the CUID body, not the table prefix, in the footer code', async () => {
    const result = await service.generateNdaPdf({
      organizationName: 'Acme Corp',
      signerName: 'Jane Doe',
      signerEmail: 'jane@example.com',
      agreementId: 'tna_6afdeb9edece020b0a2b0ee1',
    });

    const text = pdfTextOf(result);
    expect(text).toContain('NDA-6AFDEB9E');
    expect(text).not.toContain('NDA-TNA_');
  });

  it('still watermarks an existing PDF', async () => {
    const source = await PDFDocument.create();
    source.addPage();
    const result = await service.watermarkExistingPdf(Buffer.from(await source.save()), {
      name: 'Jane Doe',
      email: 'jane@example.com',
      docId: 'doc-1',
    });

    expect((await PDFDocument.load(result)).getPageCount()).toBe(1);
    expect(pdfTextOf(result)).toContain(hexOf('Page 1 of 1'));
  });

  it('skips the legacy page footer when asked, for PDFs that carry the house footer', async () => {
    const source = await PDFDocument.create();
    source.addPage();
    const result = await service.watermarkExistingPdf(Buffer.from(await source.save()), {
      name: 'Jane Doe',
      email: 'jane@example.com',
      docId: 'doc-1',
      footer: false,
    });

    const text = pdfTextOf(result);
    expect(text).toContain(hexOf('Requested by: jane@example.com'));
    expect(text).not.toContain(hexOf('Page 1 of 1'));
  });
});
