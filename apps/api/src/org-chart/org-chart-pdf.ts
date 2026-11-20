import { BadRequestException } from '@nestjs/common';
import { renderHousePdf } from '../utils/house-pdf';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width/height from the PNG's IHDR chunk; rejects anything that is not a PNG. */
export function readPngSize(dataUrl: string): { width: number; height: number } {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new BadRequestException('image must be a PNG');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new BadRequestException('image has no size');
  return { width, height };
}

/** The org chart as a house-style document: cover + metadata, then the chart image. */
export function renderOrgChartPdf({
  name,
  asOf,
  peopleCount,
  image,
  organizationName,
  primaryColor,
}: {
  name: string;
  asOf: string;
  peopleCount: number;
  image: string;
  organizationName: string | null;
  primaryColor: string | null;
}): Buffer {
  const { width, height } = readPngSize(image);
  const date = new Date(asOf).toISOString().slice(0, 10);
  const documentCode = `ORG-CHART-${date.replace(/-/g, '')}`;
  const classification = 'Internal';
  return renderHousePdf({
    title: name,
    subtitle: `As of ${date}`,
    label: 'Organization chart',
    documentCode,
    organizationName,
    primaryColor,
    classification,
    rows: [
      { label: 'Document ID', value: documentCode },
      { label: 'Chart', value: name },
      { label: 'As of', value: date },
      { label: 'People', value: String(peopleCount) },
      { label: 'Classification', value: classification },
    ],
    sections: [{ heading: '1. Organization chart', blocks: [{ kind: 'image', dataUrl: image, width, height }] }],
  });
}
