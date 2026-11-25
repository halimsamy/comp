jest.mock('@db', () => ({ db: {} }));
jest.mock('../../app/s3', () => ({ BUCKET_NAME: 'bucket', getObjectAsBuffer: jest.fn() }));
jest.mock('../../isms/utils/export-payload', () => ({
  parseExportSnapshot: jest.fn(),
  renderSnapshot: jest.fn(),
}));
jest.mock('../../soa/soa.service', () => ({ SOAService: jest.fn() }));
const mockLoadScans = jest.fn();
jest.mock('./framework-evidence-scans', () => ({
  ...jest.requireActual('./framework-evidence-scans'),
  loadScanEvidence: (...a: unknown[]) => mockLoadScans(...a),
}));
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));

import { loadNativeArtifacts } from './framework-evidence-native';
import { REGISTERS } from './registers/registers';

describe('loadNativeArtifacts: vulnerability scans', () => {
  const period = { from: new Date('2026-01-01'), to: new Date('2026-06-30') };
  const load = ({
    registers,
    frameworkName = 'PCI DSS v4.0.1',
  }: {
    registers: Array<'risks' | 'vulnerabilities'>;
    frameworkName?: string;
  }) =>
    loadNativeArtifacts({
      organizationId: 'org_1',
      frameworkId: null,
      frameworkName,
      access: { registers, soa: false },
      period,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadScans.mockResolvedValue([{ id: 'vscan_1' }]);
    jest.spyOn(REGISTERS.risks, 'build').mockResolvedValue('risk-csv');
    jest.spyOn(REGISTERS.vulnerabilities, 'build').mockResolvedValue('vuln-csv');
  });

  it('loads scans only with read access to the vulnerabilities register', async () => {
    expect((await load({ registers: ['risks'] })).scans).toEqual([]);
    expect(mockLoadScans).not.toHaveBeenCalled();
  });

  it('loads scans within the audit period, like uploads and document submissions', async () => {
    expect((await load({ registers: ['vulnerabilities'] })).scans).toEqual([{ id: 'vscan_1' }]);
    expect(mockLoadScans).toHaveBeenCalledWith({ organizationId: 'org_1', period });
  });

  it('does not download scan reports for a framework whose folders cannot place them', async () => {
    expect((await load({ registers: ['vulnerabilities'], frameworkName: 'Custom SOC' })).scans).toEqual([]);
    expect(mockLoadScans).not.toHaveBeenCalled();
  });
});
