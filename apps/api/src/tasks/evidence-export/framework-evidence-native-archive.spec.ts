jest.mock('@db', () => ({ db: {} }));
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));

import { appendFolderNative, buildReadme, NativeIndex } from './framework-evidence-native-archive';
import type { NativeArtifacts } from './framework-evidence-native';

const natives = (soa: NativeArtifacts['soa'] = null): NativeArtifacts => ({
  isms: [],
  unpublishedIsms: [],
  soa,
  registers: new Map(),
  omittedRegisters: [],
  soaOmitted: false,
});
const readme = (args: Partial<Parameters<typeof buildReadme>[0]> = {}) =>
  buildReadme({ frameworkName: 'ISO 27001', organizationName: 'Spare', natives: natives(), period: {}, ...args });

describe('buildReadme', () => {
  it('describes Vendors/ and Risk reviews/ only when they were written', () => {
    expect(readme()).not.toContain('Vendors/');
    expect(readme()).not.toContain('Risk reviews/');

    const both = readme({ records: { vendorDocuments: 3, riskReviews: 1 } });
    expect(both).toContain('Vendors/ holds');
    expect(both).toContain('Risk reviews/ holds');
  });

  it('describes vulnerability scans only when the export holds them', () => {
    const none = { vendorDocuments: 0, riskReviews: 0 };
    expect(readme({ records: none })).not.toContain('Vulnerability scans/');

    const both = readme({ records: { ...none, scanFolders: 1 } });
    expect(both).toContain('"Vulnerability scans/"');
  });

  it('flags an SoA that is not approved, whatever its workflow status', () => {
    const soa = (status: string) => ({ fileName: 'SoA v1.pdf', status, pdf: Buffer.from('') });
    expect(readme({ natives: natives(soa('draft')) })).toContain('not approved yet (status: draft)');
    expect(readme({ natives: natives(soa('approved')) })).not.toContain('not approved yet');
    expect(readme({ natives: natives(soa('completed')) })).toContain('not approved yet (status: completed)');
  });
});

describe('appendFolderNative', () => {
  it('writes the rows citing the requirement next to the full registers', () => {
    const archive = { append: jest.fn() };
    const index = new NativeIndex();

    appendFolderNative({
      archive: archive as unknown as import('archiver').Archiver,
      root: 'export',
      folder: '10.6.2 Time sync',
      native: {
        isms: [],
        soa: false,
        registers: [],
        cited: [{ key: 'findings', csv: '"Reference"\n"NC-14"', count: 1 }],
      },
      natives: natives(),
      index,
    });

    expect(archive.append).toHaveBeenCalledWith('"Reference"\n"NC-14"', {
      name: 'export/10.6.2 Time sync/Registers/findings-citing-this-requirement.csv',
    });
    expect(index.toCsv()).toContain('Nonconformities and findings citing the requirement');
  });
});
