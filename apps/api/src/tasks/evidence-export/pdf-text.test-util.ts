import { inflateSync } from 'zlib';

/** PDF text with FlateDecode content streams inflated (the house renderer compresses). */
export function pdfText(pdf: Buffer): string {
  return pdf
    .toString('latin1')
    .replace(/stream\r?\n([\s\S]*?)\r?\nendstream/g, (whole, body: string) => {
      try {
        return inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
      } catch {
        return whole;
      }
    });
}
