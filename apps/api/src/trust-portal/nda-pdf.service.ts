import { Injectable, Logger } from '@nestjs/common';
import {
  PDFDocument,
  rgb,
  StandardFonts,
  degrees,
  EncryptedPDFError,
} from 'pdf-lib';
import { AttachmentsService } from '../attachments/attachments.service';
import { renderHousePdf } from '../utils/house-pdf';

@Injectable()
export class NdaPdfService {
  private readonly logger = new Logger(NdaPdfService.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  async generateNdaPdf(params: {
    organizationName: string;
    signerName: string;
    signerEmail: string;
    agreementId: string;
    primaryColor?: string | null;
  }): Promise<Buffer> {
    const { organizationName, signerName, signerEmail, agreementId, primaryColor } = params;
    // ISO dates in UTC, matching the ISMS export metadata.
    const iso = new Date().toISOString();
    const date = iso.slice(0, 10);
    const signedAt = `${date} ${iso.slice(11, 16)} UTC`;

    const housePdf = renderHousePdf({
      title: 'Non-Disclosure Agreement',
      subtitle: `${organizationName} and ${signerName}`,
      label: 'Agreement',
      documentCode: `NDA-${this.shortId(agreementId).toUpperCase()}`,
      organizationName,
      primaryColor: primaryColor ?? null,
      rows: [
        { label: 'Document ID', value: agreementId },
        { label: 'Disclosing party', value: organizationName },
        { label: 'Receiving party', value: signerName },
        { label: 'Date', value: date },
      ],
      sections: [
        {
          heading: '',
          intro: `This Non-Disclosure Agreement ("Agreement") is entered into on ${date} between ${organizationName} ("Disclosing Party") and ${signerName} ("Receiving Party").`,
        },
        {
          heading: '1. Confidential information',
          intro:
            'The Receiving Party acknowledges that they will receive access to confidential compliance documentation and policy materials.',
        },
        {
          heading: '2. Obligations',
          intro: 'The Receiving Party agrees to:',
          blocks: [
            {
              kind: 'bullets',
              items: [
                'a) Maintain all confidential information in strict confidence',
                'b) Not disclose confidential information to any third party without prior written consent',
                'c) Use confidential information solely for evaluation purposes',
                'd) Return or destroy all confidential materials upon request',
              ],
            },
          ],
        },
        {
          heading: '3. Term',
          intro:
            'This Agreement shall remain in effect for a period of two (2) years from the date of execution.',
        },
        {
          heading: '4. Remedies',
          intro:
            'The Receiving Party acknowledges that unauthorized disclosure may cause irreparable harm.',
        },
        {
          heading: '5. Receiving party',
          intro:
            'By signing below, the Receiving Party agrees to be bound by the terms of this Agreement.',
          keyValues: [
            { label: 'Name', value: signerName },
            { label: 'Email', value: signerEmail },
            { label: 'Signed', value: signedAt },
          ],
        },
      ],
    });

    // The house footer already carries "NDA-<id> · Page n of m".
    const pdfDoc = await PDFDocument.load(housePdf);
    await this.addWatermark({ pdfDoc, email: signerEmail, docId: agreementId, footer: false });
    return Buffer.from(await pdfDoc.save());
  }

  private shortId(id: string): string {
    // Drop prefixes such as 'tna_' (prefixed CUIDs) or 'preview-'.
    return id.split(/[-_]/).pop()?.slice(0, 8) ?? id;
  }

  private async addWatermark({
    pdfDoc,
    email,
    docId,
    footer = true,
  }: {
    pdfDoc: PDFDocument;
    email: string;
    docId: string;
    footer?: boolean;
  }) {
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const watermarkText = 'CompAI';
    const requestedByText = `Requested by: ${email}`;
    const fontSize = 48;
    const subTextSize = 12;

    for (const page of pages) {
      const { width, height } = page.getSize();
      const pageNumber = pages.indexOf(page) + 1;

      // Create a repeating diagonal watermark pattern with alternating angles
      const horizontalSpacing = 250; // Space between watermarks horizontally
      const verticalSpacing = 180; // Space between watermarks vertically

      // Calculate how many watermarks we need to cover the page
      const numRows = Math.ceil(height / verticalSpacing) + 2;
      const numCols = Math.ceil(width / horizontalSpacing) + 2;

      for (let row = -1; row < numRows; row++) {
        for (let col = -1; col < numCols; col++) {
          // Create a checkerboard-like offset pattern
          const offsetX = (row % 2) * (horizontalSpacing / 2);
          const x = col * horizontalSpacing + offsetX;
          const y = row * verticalSpacing;

          // Alternate between -45 and -35 degrees for visual interest
          const angle = (row + col) % 2 === 0 ? -45 : -35;

          // Main "CompAI" watermark
          page.drawText(watermarkText, {
            x,
            y,
            size: fontSize,
            font: fontBold,
            color: rgb(0.85, 0.85, 0.85), // Darker gray
            opacity: 0.1, // Increased opacity for better visibility
            rotate: degrees(angle),
          });

          // "Requested by: [email]" text below CompAI
          page.drawText(requestedByText, {
            x: x - 10,
            y: y - 18,
            size: subTextSize,
            font: fontRegular,
            color: rgb(0.85, 0.85, 0.85), // Darker gray
            opacity: 0.1, // Slightly darker and more visible
            rotate: degrees(angle),
          });
        }
      }

      if (!footer) continue;
      // Add small footer with page number and document ID
      const footerText = `Page ${pageNumber} of ${pages.length}  •  Document ID: ${this.shortId(docId)}`;

      page.drawText(footerText, {
        x: width / 2 - fontRegular.widthOfTextAtSize(footerText, 8) / 2,
        y: 15,
        size: 8,
        font: fontRegular,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  async uploadNdaPdf(
    organizationId: string,
    agreementId: string,
    pdfBuffer: Buffer,
  ): Promise<string> {
    const fileName = `nda-${agreementId}-${Date.now()}.pdf`;

    const s3Key = await this.attachmentsService.uploadToS3(
      pdfBuffer,
      fileName,
      'application/pdf',
      organizationId,
      'trust_nda',
      agreementId,
    );

    return s3Key;
  }

  async getSignedUrl(s3Key: string): Promise<string> {
    return this.attachmentsService.getPresignedDownloadUrl(s3Key);
  }

  async watermarkExistingPdf(
    pdfBuffer: Buffer,
    params: {
      name: string;
      email: string;
      docId: string;
      watermarkText?: string;
      /** false for house-rendered PDFs, which already carry their own page footer. */
      footer?: boolean;
    },
  ): Promise<Buffer> {
    const { email, docId, footer } = params;

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer);
    } catch (error) {
      // Check for encrypted PDF error - use name/message check as instanceof can fail across module boundaries
      const isEncryptedError =
        error instanceof EncryptedPDFError ||
        (error instanceof Error &&
          (error.name === 'EncryptedPDFError' ||
            error.message.includes('is encrypted')));

      if (isEncryptedError) {
        // Encrypted PDF - return as-is without watermark
        // User already signed NDA for accountability, encrypted PDFs require password anyway
        this.logger.debug(
          `Skipping watermark for PDF ${docId} - file is encrypted`,
        );
        return pdfBuffer;
      }
      // Re-throw other parsing errors
      throw error;
    }

    await this.addWatermark({ pdfDoc, email, docId, footer });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
