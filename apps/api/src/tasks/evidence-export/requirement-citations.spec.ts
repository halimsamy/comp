import {
  citationPrefix,
  citingCsv,
  parseRequirementCitations,
  toCitedRows,
} from './requirement-citations';

describe('parseRequirementCitations', () => {
  it.each([
    ['PCI DSS 10.6.2', ['pci:10.6.2']],
    ['PCI DSS A1.2.1', ['pci:A1.2.1']],
    [
      'PCI DSS 6.3.1, 6.3.2, 11.3.1; ISO 27001 A.8.8',
      ['pci:6.3.1', 'pci:6.3.2', 'pci:11.3.1', 'iso27001:A.8.8'],
    ],
    // A bare segment continues the previous framework.
    ['PCI DSS 6.4.3; 11.6.1', ['pci:6.4.3', 'pci:11.6.1']],
    ['ISO 27001 clauses 5.3, 6.2', ['iso27001:5.3', 'iso27001:6.2']],
    ['ISO/IEC 27001:2022 A.5.18', ['iso27001:A.5.18']],
    ['PCI DSS v4.0.1 3.2.1; A.8.10', ['pci:3.2.1', 'iso27001:A.8.10']],
    [
      'PCI DSS 10.2.1, 10.2.1.1-10.2.1.3',
      ['pci:10.2.1', 'pci:10.2.1.1', 'pci:10.2.1.2', 'pci:10.2.1.3'],
    ],
    ['PCI DSS 12.10.4, 12.10.4.1', ['pci:12.10.4', 'pci:12.10.4.1']],
    // Other standards cite nothing, and do not inherit the previous framework.
    ['Egyptian PDPL 151/2020 (licence); ISO 27001 A.5.31', ['iso27001:A.5.31']],
    ['PCI DSS 12.8.2; GDPR Art. 28, 30(2), 44-46', ['pci:12.8.2']],
    ['Not required by PCI DSS or ISO 27001', []],
    ['', []],
    [null, []],
  ])('%s', (reference, expected) => {
    expect(parseRequirementCitations(reference)).toEqual(expected);
  });
});

describe('citationPrefix', () => {
  it('takes the text before the first ": " only', () => {
    expect(citationPrefix('PCI DSS 10.3.4; ISO 27001 A.8.15: No alert fires.')).toBe(
      'PCI DSS 10.3.4; ISO 27001 A.8.15',
    );
    expect(citationPrefix('Backup not tested')).toBe('');
    expect(citationPrefix(null)).toBe('');
  });
});

describe('citingCsv', () => {
  const cited = toCitedRows({
    headers: ['Reference', 'Description'],
    rows: [
      ['NC-14', 'time sync'],
      ['NC-52', 'log alerts'],
      ['NC-01', 'no policy'],
    ],
    cites: ['PCI DSS 10.6.2', 'PCI DSS 10.3.4; ISO 27001 A.8.15', ''],
  });

  it('keeps only the rows citing the requirement', () => {
    expect(citingCsv({ cited, key: 'iso27001:A.8.15' })).toEqual({
      csv: '"Reference","Description"\n"NC-52","log alerts"',
      count: 1,
    });
  });

  it('returns null when no row cites it, so no empty file is written', () => {
    expect(citingCsv({ cited, key: 'pci:A.8.15' })).toBeNull();
  });
});
