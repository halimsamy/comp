import { inflateSync } from 'zlib';
import { applicabilityLabel, generateSOAExportFile, soaStatus, toAnnexCode } from './export-generator';

const metadata = { preparedBy: 'Halim', answeredQuestions: 1, totalQuestions: 2 };
const question = (id: string, closure: string, isApplicable: boolean | null) => ({
  id,
  text: id,
  columnMapping: {
    closure,
    title: `Control ${closure}`,
    control_objective: 'Objective',
    isApplicable,
    justification: isApplicable === null ? null : 'Because',
    implementation: isApplicable ? 'In progress' : null,
    inheritedFrom: isApplicable ? 'AWS' : null,
  },
  answer: null,
});

/** PDF text with FlateDecode content streams inflated (the house renderer compresses). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  return raw.replace(/stream\r?\n([\s\S]*?)\r?\nendstream/g, (whole, body: string) => {
    try {
      return inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
    } catch {
      return whole;
    }
  });
}

describe('SoA export', () => {
  it('never prints an unanswered control as Yes or N/A', () => {
    expect(applicabilityLabel(null)).toBe('Not yet decided');
    expect(applicabilityLabel(undefined)).toBe('Not yet decided');
    expect(applicabilityLabel(true)).toBe('Yes');
    expect(applicabilityLabel(false)).toBe('No');
  });

  it('prints Annex A codes', () => {
    expect(toAnnexCode('5.15')).toBe('A.5.15');
    expect(toAnnexCode('A.5.15')).toBe('A.5.15');
  });

  it('writes the control code, decision, implementation and supplier into the PDF', () => {
    const { fileBuffer, mimeType, filename } = generateSOAExportFile(
      [question('q1', '5.15', true), question('q2', '7.4', null)],
      'ISO 27001',
      3,
      { ...metadata, organizationName: 'Spare Payments' },
    );
    const text = pdfText(fileBuffer);
    expect(mimeType).toBe('application/pdf');
    expect(filename).toBe('statement-of-applicability-iso-27001-v3.pdf');
    // House cover + ISMS metadata table.
    expect(text).toContain('(Statement of Applicability)');
    expect(text).toContain('Clause 6.1.3 d\\)');
    expect(text).toContain('ISO/IEC 27001:2022');
    expect(text).toContain('(Prepared by)');
    expect(text).toContain('(Halim)');
    expect(text).toContain('1 / 2 controls answered \\(50%\\)');
    // Controls table.
    expect(text).toContain('(A.5.15)');
    // The narrow Applicable column wraps the supplier note.
    expect(text).toContain('Yes \\(inherited');
    expect(text).toContain('from AWS\\)');
    expect(text).toContain('(Implementation:)');
    expect(text).toContain('(In progress)');
    expect(text).toContain('v3 \u00B7 DRAFT');
    expect(text).toContain('(Not yet decided)');
    // Org-prefixed ISMS document ID, version kept out of it.
    expect(text).toContain('SP-ISMS-SOA');
    expect(text).not.toContain('SOA-v3');
  });

  it('heads a completed but unapproved SoA as completed, with a "Not approved" line', () => {
    expect(soaStatus({ status: 'completed' })).toBe('completed');
    expect(soaStatus({ status: 'draft' })).toBe('draft');
    expect(soaStatus({ status: 'completed', approvedAt: new Date('2026-11-01') })).toBe('approved');
    expect(soaStatus({ status: 'completed', declinedAt: new Date('2026-11-01') })).toBe('declined');
    expect(soaStatus({ status: 'needs_review' })).toBe('needs_review');

    const text = pdfText(
      generateSOAExportFile([question('q1', '5.15', true)], 'ISO 27001', 1, { ...metadata, status: 'completed' })
        .fileBuffer,
    );
    expect(text).toContain('v1 \u00B7 COMPLETED');
    expect(text).not.toContain('APPROVED');
    expect(text).toContain('(Not approved)');
  });
});
