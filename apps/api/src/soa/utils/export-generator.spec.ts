import { applicabilityLabel, generateSOAExportFile, toAnnexCode } from './export-generator';

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
      metadata,
    );
    const text = fileBuffer.toString('latin1');
    expect(mimeType).toBe('application/pdf');
    expect(filename).toBe('statement-of-applicability-iso-27001-v3.pdf');
    expect(text).toContain('Control: A.5.15');
    expect(text).toContain('Applicable: Yes \\(inherited from AWS\\)');
    expect(text).toContain('Implementation: In progress');
    expect(text).toContain('Applicable: Not yet decided');
    expect(text).toContain('Prepared by: Halim');
  });
});
