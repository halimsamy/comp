const scanFindMany = jest.fn();
const attachmentFindMany = jest.fn();
jest.mock('@db', () => ({
  db: {
    vulnerabilityScan: { findMany: (...a: unknown[]) => scanFindMany(...a) },
    attachment: { findMany: (...a: unknown[]) => attachmentFindMany(...a) },
  },
}));
const getObject = jest.fn();
jest.mock('../../app/s3', () => ({
  BUCKET_NAME: 'bucket',
  getObjectAsBuffer: (...a: unknown[]) => getObject(...a),
}));
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));

import { NativeIndex } from './framework-evidence-native-archive';
import {
  appendFolderScans,
  loadScanEvidence,
  scanKindsFor,
  scansForFolder,
  type ScanEvidence,
} from './framework-evidence-scans';

const asv: ScanEvidence = {
  id: 'vscan_asv',
  kind: 'external_asv',
  vendor: 'Clone Systems',
  scannedAt: new Date('2026-10-29T00:00:00Z'),
  passed: true,
  findingCount: 0,
  report: { name: 'ASV-Attestation.pdf', key: 'org_1/asv.pdf', pdf: Buffer.from('asv') },
};
const pentest: ScanEvidence = {
  ...asv,
  id: 'vscan_pt',
  kind: 'pentest',
  vendor: 'IGRC Square',
  passed: null,
  findingCount: 5,
  report: { name: 'Pentest.pdf', key: 'org_1/pt.pdf', pdf: Buffer.from('pt') },
};

describe('vulnerability scans in the framework export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('places ASV scans on 11.3.2, internal on 11.3.1, pentests on 11.4.x and all on ISO A.8.8', () => {
    expect(scanKindsFor('pci:11.3.2')).toEqual(['external_asv']);
    expect(scanKindsFor('pci:11.3.2.1')).toEqual(['external_asv']);
    expect(scanKindsFor('pci:11.3.1.2')).toEqual(['internal']);
    expect(scanKindsFor('pci:11.4.3')).toEqual(['pentest']);
    expect(scanKindsFor('pci:11.40')).toEqual([]);
    expect(scanKindsFor('pci:6.3.1')).toEqual([]);
    expect(scanKindsFor('iso27001:A.8.8')).toEqual(['external_asv', 'internal', 'pentest']);
    expect(scanKindsFor('iso27001:A.8.9')).toEqual([]);
    expect(scanKindsFor(null)).toEqual([]);
  });

  it('does not copy a pentest report already exported as a Penetration Test submission', () => {
    const scans = scansForFolder({
      citation: 'iso27001:A.8.8',
      scans: [asv, pentest],
      documentFileKeys: new Set(['org_1/pt.pdf']),
    });
    expect(scans.map((s) => [s.id, s.reportInDocuments])).toEqual([
      ['vscan_asv', false],
      ['vscan_pt', true],
    ]);

    const names: string[] = [];
    const sources = new Map<string, unknown>();
    const archive = {
      append: (source: unknown, { name }: { name: string }) => {
        names.push(name);
        sources.set(name, source);
      },
    };
    const index = new NativeIndex();
    appendFolderScans({
      archive: archive as unknown as Parameters<typeof appendFolderScans>[0]['archive'],
      root: 'root',
      folder: 'A.8.8 Vulns',
      scans,
      index,
    });

    expect(names).toEqual([
      'root/A.8.8 Vulns/Vulnerability scans/ASV-Attestation.pdf',
      'root/A.8.8 Vulns/Vulnerability scans/scans.csv',
    ]);
    expect(String(sources.get('root/A.8.8 Vulns/Vulnerability scans/scans.csv')).split('\n')).toEqual([
      '"Scan ID","Kind","Vendor","Scanned","Result","Findings","Report"',
      '"vscan_asv","ASV scan","Clone Systems","2026-10-29","Passed","0","ASV-Attestation.pdf"',
      '"vscan_pt","Penetration test","IGRC Square","2026-10-29","No verdict","5","In Documents/ (document submission file)"',
    ]);
    expect(index.toCsv()).toContain('"Vulnerability scan","ASV scan 2026-10-29 by Clone Systems, passed"');
  });

  it('loads scan reports from this organization only', async () => {
    scanFindMany.mockResolvedValue([
      { ...asv, attachmentId: 'att_1' },
      { ...pentest, attachmentId: 'att_2' },
    ]);
    attachmentFindMany.mockResolvedValue([
      { id: 'att_1', name: 'ASV.pdf', url: 'org_1/asv.pdf' },
      { id: 'att_2', name: 'Other.pdf', url: 'org_2/pt.pdf' },
    ]);
    getObject.mockResolvedValue(Buffer.from('bytes'));

    const scans = await loadScanEvidence({ organizationId: 'org_1' });

    expect(scanFindMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1' });
    expect(attachmentFindMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      entityType: 'vulnerability_scan',
      id: { in: ['att_1', 'att_2'] },
    });
    expect(scans.map((s) => s.report?.key ?? null)).toEqual(['org_1/asv.pdf', null]);
    expect(getObject).toHaveBeenCalledTimes(1);
  });

  it('leaves out scans dated outside the audit period, as documents are', async () => {
    scanFindMany.mockResolvedValue([]);
    const period = { from: new Date('2026-01-01'), to: new Date('2026-06-30') };

    expect(await loadScanEvidence({ organizationId: 'org_1', period })).toEqual([]);
    expect(scanFindMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      scannedAt: { gte: period.from, lte: period.to },
    });
    expect(attachmentFindMany).not.toHaveBeenCalled();
  });

  it('indexes each folder scans.csv in native-artifacts.csv', () => {
    const index = new NativeIndex();
    appendFolderScans({
      archive: { append: jest.fn() } as unknown as Parameters<typeof appendFolderScans>[0]['archive'],
      root: 'root',
      folder: '11.4.3 Pentest',
      scans: scansForFolder({ citation: 'pci:11.4.3', scans: [pentest], documentFileKeys: new Set(['org_1/pt.pdf']) }),
      index,
    });
    expect(index.toCsv()).toContain('"Vulnerability scans","Scan list per requirement"');
    expect(index.toCsv()).toContain('11.4.3 Pentest/Vulnerability scans/scans.csv');
  });
});
