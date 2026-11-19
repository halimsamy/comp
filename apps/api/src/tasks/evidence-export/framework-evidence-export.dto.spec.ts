import { frameworkExportKey, periodSlug } from './framework-evidence-export.dto';

describe('frameworkExportKey (#18)', () => {
  it('gives every run its own object under the org exports prefix', () => {
    const key = (runId: string) =>
      frameworkExportKey({ organizationId: 'org_1', frameworkInstanceId: 'frm_1', runId });

    expect(key('run_a')).toBe('org_1/exports/framework-evidence-frm_1-run_a.zip');
    expect(key('run_a')).not.toBe(key('run_b'));
  });
});

describe('periodSlug', () => {
  it('names the audit period in the download filename', () => {
    expect(periodSlug({ from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' })).toBe(
      '2026-01-01_to_2026-12-31',
    );
    expect(periodSlug({ from: '2026-01-01T00:00:00.000Z' })).toBe('from_2026-01-01');
    expect(periodSlug({})).toBe('all-time');
  });
});
