import { BadRequestException } from '@nestjs/common';
import { inflateSync } from 'zlib';
import { readPngSize, renderOrgChartPdf } from './org-chart-pdf';

// 1x1 transparent PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The house renderer compresses its content streams: inflate them so text can be asserted. */
const pdfTextOf = (pdf: Buffer): string =>
  pdf.toString('latin1').replace(/stream\r?\n([\s\S]*?)endstream/g, (whole, body: string) => {
    try {
      return inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    } catch {
      return whole;
    }
  });

describe('org chart PDF', () => {
  it('reads the size from the PNG header', () => {
    expect(readPngSize(PNG)).toEqual({ width: 1, height: 1 });
  });

  it('rejects data that is not a PNG', () => {
    expect(() => readPngSize('data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD')).toThrow(
      BadRequestException,
    );
  });

  it('renders a house-style document with the chart metadata', () => {
    const pdf = renderOrgChartPdf({
      name: 'Acme org chart',
      asOf: '2026-11-20T10:00:00.000Z',
      peopleCount: 42,
      image: PNG,
      organizationName: 'Acme',
      primaryColor: '#1fa2c4',
    });

    const text = pdfTextOf(pdf);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Acme org chart');
    expect(text).toContain('As of 2026-11-20');
    expect(text).toContain('ORG-CHART-20261120');
    expect(text).toContain('Document ID');
    expect(text).toContain('Classification');
    expect(text).toContain('/Subtype /Image');
  });
});
