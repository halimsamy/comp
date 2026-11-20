import { inflateSync } from 'zlib';
import { HIPAA_TRAINING_ID } from '@trycompai/company';
import {
  TrainingCertificatePdfService,
  certificateIdFor,
  cleanTextForPDF,
} from './training-certificate-pdf.service';

/** The house renderer compresses its content streams: inflate them so text can be asserted. */
const pdfTextOf = (pdf: Buffer): string =>
  pdf.toString('latin1').replace(/stream\r?\n([\s\S]*?)endstream/g, (whole, body: string) => {
    try {
      return inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    } catch {
      return whole;
    }
  });

describe('TrainingCertificatePdfService', () => {
  let service: TrainingCertificatePdfService;

  beforeEach(() => {
    service = new TrainingCertificatePdfService();
  });

  describe('generateTrainingCertificatePdf', () => {
    it('returns a valid PDF buffer', async () => {
      const result = await service.generateTrainingCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'Jane Doe',
        organizationName: 'Acme Corp',
        completedAt: new Date('2026-01-15'),
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('handles unicode characters in names', async () => {
      const result = await service.generateTrainingCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'José García',
        organizationName: 'Café Corp—LLC',
        completedAt: new Date('2026-03-01'),
      });

      expect(pdfTextOf(result)).toContain('Café Corp-LLC');
    });

    it('renders the house cover, completion date and certifier', async () => {
      const result = await service.generateTrainingCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'Test User',
        organizationName: 'Test Org',
        completedAt: new Date('2026-06-15T12:00:00Z'),
        primaryColor: '#1fa2c4',
      });

      const pdfText = pdfTextOf(result);
      expect(pdfText).toContain('Certificate of completion');
      expect(pdfText).toContain('Security Awareness Training');
      expect(pdfText).toContain('June 15, 2026');
      expect(pdfText).toContain('Comp AI');
      expect(pdfText).toContain('Page 1 of 1');
    });
  });

  describe('generateCustomCertificatePdf', () => {
    it('includes validity, certificate ID, requirement and modules', async () => {
      const result = await service.generateCustomCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'Jane Doe',
        organizationName: 'Acme Corp',
        completedAt: new Date('2026-01-15T12:00:00Z'),
        title: 'Phishing 101',
        details: {
          validUntil: new Date('2027-01-15T12:00:00Z'),
          certificateId: 'TC-ABC123-DEF456-20260115',
          requirement: 'ISO/IEC 27001:2022 A.6.3',
          modules: ['Spotting phishing emails'],
        },
      });

      const pdfText = pdfTextOf(result);
      expect(pdfText).toContain('TC-ABC123-DEF456-20260115');
      expect(pdfText).toContain('January 15, 2027');
      expect(pdfText).toContain('ISO/IEC 27001:2022 A.6.3');
      expect(pdfText).toContain('Spotting phishing emails');
      // Document ID leads the metadata table, as in the ISMS exports.
      expect(pdfText.indexOf('Certificate ID')).toBeGreaterThan(-1);
      expect(pdfText.indexOf('Certificate ID')).toBeLessThan(pdfText.indexOf('Completed on'));
    });
  });

  describe('generateHipaaCertificatePdf', () => {
    it('titles the certificate HIPAA', async () => {
      const result = await service.generateHipaaCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'Jane Doe',
        organizationName: 'Acme Corp',
        completedAt: new Date('2026-01-15'),
      });

      expect(pdfTextOf(result)).toContain('HIPAA Security Awareness Training');
    });

    it('leads the metadata with a per-member certificate ID that matches the footer code', async () => {
      const result = await service.generateHipaaCertificatePdf({
        memberId: 'mem_abc123xyz789',
        userName: 'Jane Doe',
        organizationName: 'Acme Corp',
        completedAt: new Date('2026-01-15T12:00:00Z'),
      });

      const pdfText = pdfTextOf(result);
      const id = certificateIdFor({
        memberId: 'mem_abc123xyz789',
        moduleId: HIPAA_TRAINING_ID,
        completedAt: new Date('2026-01-15T12:00:00Z'),
      });
      expect(id).toBe('TC-XYZ789-HIPAA-20260115');
      expect(pdfText.indexOf('Certificate ID')).toBeGreaterThan(-1);
      expect(pdfText.indexOf('Certificate ID')).toBeLessThan(pdfText.indexOf('Completed on'));
      expect(pdfText.split(id).length - 1).toBe(2); // metadata row + footer
    });
  });

  it('certificateIdFor names built-in modules readably and keeps custom module suffixes', () => {
    const completedAt = new Date('2026-11-18T09:00:00Z');
    expect(certificateIdFor({ memberId: 'mem_e64726', moduleId: 'general', completedAt })).toBe(
      'TC-E64726-GENERAL-20261118',
    );
    expect(certificateIdFor({ memberId: 'mem_e64726', moduleId: 'tm_abcdef123456', completedAt })).toBe(
      'TC-E64726-123456-20261118',
    );
  });

  it('cleanTextForPDF folds smart punctuation and strips invisible characters', () => {
    expect(cleanTextForPDF('“Hi” — it’s​ ok…')).toBe('"Hi" - it\'s ok...');
  });
});
