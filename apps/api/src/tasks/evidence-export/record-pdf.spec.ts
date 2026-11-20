import { numberSections } from './record-pdf';

describe('numberSections', () => {
  it('numbers headings like the ISMS documents and skips empty ones', () => {
    expect(
      numberSections([{ heading: 'Review' }, { heading: '' }, { heading: 'Register' }]).map((s) => s.heading),
    ).toEqual(['1. Review', '', '2. Register']);
  });

  it('keeps headings the caller already numbered', () => {
    const sections = [{ heading: 'Requirement' }, { heading: '1. Constraints' }];
    expect(numberSections(sections)).toBe(sections);
  });
});
