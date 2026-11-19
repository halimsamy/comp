jest.mock('@db', () => ({ db: {} }));
import { linksFor, parseFrameworkRef } from './risk-library-links';

describe('parseFrameworkRef', () => {
  it.each([
    ['PCI DSS 6.4.3', { framework: 'pci', identifier: '6.4.3' }],
    ['ISO A.8.28', { framework: 'iso', identifier: 'A.8.28' }],
    ['ISO 27001 a.5.19', { framework: 'iso', identifier: 'A.5.19' }],
    ['SOC 2 CC6.1', null],
  ])('%s', (ref, expected) => {
    expect(parseFrameworkRef(ref)).toEqual(expected);
  });
});

describe('linksFor', () => {
  it('unions controls and tasks without duplicates', () => {
    const links = new Map([
      ['A', { controlIds: ['c1'], taskIds: ['t1', 't2'] }],
      ['B', { controlIds: ['c1', 'c2'], taskIds: ['t2'] }],
    ]);
    expect(linksFor({ links, refs: ['A', 'B', 'missing'] })).toEqual({
      controlIds: ['c1', 'c2'],
      taskIds: ['t1', 't2'],
    });
  });
});
