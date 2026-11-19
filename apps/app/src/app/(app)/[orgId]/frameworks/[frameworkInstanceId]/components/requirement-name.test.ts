import { describe, expect, it } from 'vitest';
import { stripIdentifier } from './requirement-name';

describe('stripIdentifier', () => {
  it('drops a leading identifier from the name', () => {
    expect(stripIdentifier({ name: 'A.5.15 Access control', identifier: 'A.5.15' })).toBe('Access control');
    expect(stripIdentifier({ name: '6.1.3 Planning', identifier: '6.1.3' })).toBe('Planning');
  });

  it('keeps names that do not start with the identifier', () => {
    expect(stripIdentifier({ name: 'Configuration standards', identifier: '1.2.1' })).toBe('Configuration standards');
    expect(stripIdentifier({ name: 'A.5.1', identifier: 'A.5.1' })).toBe('A.5.1');
    expect(stripIdentifier({ name: 'Scope', identifier: null })).toBe('Scope');
  });
});
