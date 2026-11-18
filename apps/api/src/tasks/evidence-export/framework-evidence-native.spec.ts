const mockDb = {
  ismsDocument: { findMany: jest.fn() },
  sOADocument: { findFirst: jest.fn(), count: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
const mockGetObject = jest.fn();
jest.mock('../../app/s3', () => ({
  BUCKET_NAME: 'bucket',
  getObjectAsBuffer: (...args: unknown[]) => mockGetObject(...args),
}));
const mockRenderSnapshot = jest.fn();
jest.mock('../../isms/utils/export-payload', () => ({
  parseExportSnapshot: (value: unknown) => value ?? null,
  renderSnapshot: (...args: unknown[]) => mockRenderSnapshot(...args),
}));
const mockExportSoa = jest.fn();
jest.mock('../../soa/soa.service', () => ({
  SOAService: jest.fn(() => ({ exportDocument: mockExportSoa })),
}));
const mockBuildRisks = jest.fn();
jest.mock('./registers/registers', () => {
  const actual = jest.requireActual('./registers/registers');
  return {
    ...actual,
    REGISTERS: {
      ...actual.REGISTERS,
      risks: {
        ...actual.REGISTERS.risks,
        build: (...a: unknown[]) => mockBuildRisks(...a),
      },
    },
  };
});
jest.mock('../../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));

import {
  loadNativeArtifacts,
  nativeForFolder,
} from './framework-evidence-native';
import type { RequirementFolder } from './framework-evidence-plan';

const version = (
  n: number,
  pdfUrl: string | null,
  contentSnapshot: unknown = null,
) => ({
  version: n,
  pdfUrl,
  contentSnapshot,
});

describe('loadNativeArtifacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildRisks.mockResolvedValue('risk-csv');
    mockGetObject.mockResolvedValue(Buffer.from('stored'));
    mockRenderSnapshot.mockResolvedValue({
      fileBuffer: Buffer.from('rendered'),
    });
    mockDb.ismsDocument.findMany.mockResolvedValue([
      {
        title: 'ISMS Scope',
        requirementId: 'r43',
        controlLinks: [],
        currentVersion: version(2, 'org_1/isms/scope.pdf'),
      },
      {
        title: 'Risk Treatment Plan',
        requirementId: null,
        controlLinks: [{ controlId: 'ctl_1' }],
        currentVersion: version(1, null, { type: 'x' }),
      },
      {
        title: 'Management Review',
        requirementId: 'r93',
        controlLinks: [],
        currentVersion: null,
      },
    ]);
    mockDb.sOADocument.findFirst.mockResolvedValue({
      id: 'soa_1',
      version: 3,
      status: 'needs_review',
    });
    mockDb.sOADocument.count.mockResolvedValue(1);
    mockExportSoa.mockResolvedValue({ fileBuffer: Buffer.from('soa') });
  });

  it('loads published ISMS PDFs, the SoA and only the allowed registers', async () => {
    const natives = await loadNativeArtifacts({
      organizationId: 'org_1',
      frameworkId: 'frk_iso',
      access: { registers: ['risks'], soa: true },
    });

    expect(mockDb.ismsDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', frameworkId: 'frk_iso' },
      }),
    );
    expect(natives.isms.map((d) => [d.fileName, d.pdf.toString()])).toEqual([
      ['ISMS Scope v2.pdf', 'stored'],
      ['Risk Treatment Plan v1.pdf', 'rendered'],
    ]);
    expect(natives.unpublishedIsms).toEqual(['Management Review']);
    expect(mockExportSoa).toHaveBeenCalledWith({
      documentId: 'soa_1',
      organizationId: 'org_1',
      format: 'pdf',
    });
    expect(natives.soa).toMatchObject({
      fileName: 'Statement of Applicability v3.pdf',
      status: 'needs_review',
    });
    expect([...natives.registers.entries()]).toEqual([['risks', 'risk-csv']]);
    expect(natives.omittedRegisters).not.toContain('risks');
    expect(natives.omittedRegisters).toContain('people');
    expect(natives.soaOmitted).toBe(false);
  });

  it('falls back to the snapshot when the stored ISMS PDF cannot be read', async () => {
    mockGetObject.mockRejectedValue(new Error('NoSuchKey'));
    mockDb.ismsDocument.findMany.mockResolvedValue([
      {
        title: 'ISMS Scope',
        requirementId: 'r43',
        controlLinks: [],
        currentVersion: version(2, 'k', { type: 'x' }),
      },
    ]);

    const natives = await loadNativeArtifacts({
      organizationId: 'org_1',
      frameworkId: 'frk_iso',
      access: { registers: [], soa: false },
    });

    expect(natives.isms[0].pdf.toString()).toBe('rendered');
    expect(mockExportSoa).not.toHaveBeenCalled();
    expect(natives.soaOmitted).toBe(true);
  });

  it('has no ISMS documents or SoA for a custom framework', async () => {
    const natives = await loadNativeArtifacts({
      organizationId: 'org_1',
      frameworkId: null,
      access: { registers: [], soa: true },
    });

    expect(natives.isms).toEqual([]);
    expect(natives.soa).toBeNull();
    expect(mockDb.ismsDocument.findMany).not.toHaveBeenCalled();
  });
});

describe('nativeForFolder', () => {
  const folder = (
    id: string,
    identifier: string,
    extra: Partial<RequirementFolder> = {},
  ) =>
    ({
      folder: identifier,
      requirement: {
        id,
        identifier,
        name: '',
        description: '',
        frameworkId: 'frk',
        customFrameworkId: null,
        kind: 'platform',
      },
      controlNames: [],
      controlIds: [],
      policyIds: [],
      taskIds: [],
      formTypes: [],
      registers: [],
      ...extra,
    }) as RequirementFolder;

  const natives = {
    isms: [
      {
        title: 'Scope',
        fileName: 'Scope v1.pdf',
        version: 1,
        requirementId: 'r43',
        controlIds: new Set<string>(),
        pdf: Buffer.from(''),
      },
      {
        title: 'RTP',
        fileName: 'RTP v1.pdf',
        version: 1,
        requirementId: null,
        controlIds: new Set(['ctl_1']),
        pdf: Buffer.from(''),
      },
    ],
    unpublishedIsms: [],
    soa: {
      fileName: 'Statement of Applicability v1.pdf',
      status: 'completed',
      pdf: Buffer.from(''),
    },
    registers: new Map([['risks' as const, 'csv']]),
    omittedRegisters: [],
    soaOmitted: false,
  };

  it('matches ISMS documents by clause or mapped control, and only allowed registers', () => {
    expect(
      nativeForFolder({ folder: folder('r43', '4.3'), natives }).isms.map(
        (d) => d.title,
      ),
    ).toEqual(['Scope']);

    const riskFolder = nativeForFolder({
      folder: folder('r613', '6.1.3', {
        controlIds: ['ctl_1'],
        registers: ['risks', 'vendors'],
      }),
      natives,
    });
    expect(riskFolder.isms.map((d) => d.title)).toEqual(['RTP']);
    expect(riskFolder.soa).toBe(true);
    expect(riskFolder.registers).toEqual(['risks']);

    expect(nativeForFolder({ folder: folder('r1', 'A.5.1'), natives })).toEqual(
      { isms: [], soa: false, registers: [] },
    );
  });
});
