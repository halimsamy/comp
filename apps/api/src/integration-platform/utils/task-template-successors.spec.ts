import {
  mappingAppliesTo,
  templatesForMapping,
} from './task-template-successors';

describe('task template successors', () => {
  it('feeds the Detection Pack from Monitoring & Alerting checks', () => {
    expect(templatesForMapping('frk_tt_68406af04a4acb93083413b9')).toEqual([
      'frk_tt_68406af04a4acb93083413b9',
      'frk_tt_d04535046e66e84d10b92068',
    ]);
    expect(
      mappingAppliesTo({
        mapping: 'frk_tt_68406af04a4acb93083413b9',
        templateId: 'frk_tt_d04535046e66e84d10b92068',
      }),
    ).toBe(true);
  });

  it('feeds NSC Review from Production Firewall checks', () => {
    expect(
      mappingAppliesTo({
        mapping: 'frk_tt_68fa2a852e70f757188f0c39',
        templateId: 'frk_tt_9d21cfa9d3ba3a694587c610',
      }),
    ).toBe(true);
  });

  it('keeps exact matches and rejects unrelated or missing ids', () => {
    expect(templatesForMapping('frk_tt_x')).toEqual(['frk_tt_x']);
    expect(mappingAppliesTo({ mapping: 'frk_tt_x', templateId: 'frk_tt_x' })).toBe(true);
    expect(mappingAppliesTo({ mapping: 'frk_tt_x', templateId: 'frk_tt_y' })).toBe(false);
    expect(mappingAppliesTo({ mapping: undefined, templateId: 'frk_tt_y' })).toBe(false);
    // Successors are one-way: a Detection Pack check doesn't feed Monitoring & Alerting.
    expect(
      mappingAppliesTo({
        mapping: 'frk_tt_d04535046e66e84d10b92068',
        templateId: 'frk_tt_68406af04a4acb93083413b9',
      }),
    ).toBe(false);
  });
});
