import { NotFoundException } from '@nestjs/common';

type AppendCall = { source: unknown; name: string };
const appendCalls: AppendCall[] = [];
const archive = {
  append: jest.fn((source: unknown, options: { name: string }) => {
    appendCalls.push({ source, name: options.name });
    return archive;
  }),
  finalize: jest.fn(),
};

const mockDb = {
  frameworkInstance: { findFirst: jest.fn() },
  requirementMap: { findMany: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  policy: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

const mockLoadRequirements = jest.fn();
jest.mock('../../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: (...args: unknown[]) => mockLoadRequirements(...args),
}));

const mockAppendAttachment = jest.fn();
jest.mock('./evidence-attachment-streamer', () => ({
  ...jest.requireActual('./evidence-attachment-streamer'),
  appendAttachmentToArchive: (...args: unknown[]) => mockAppendAttachment(...args),
}));

const mockLoadTaskBundle = jest.fn();
jest.mock('./framework-evidence-tasks', () => ({
  loadTaskBundle: (...args: unknown[]) => mockLoadTaskBundle(...args),
  appendTaskEvidence: async ({
    archive,
    bundle,
    folderPath,
  }: {
    archive: { append: (source: unknown, options: { name: string }) => void };
    bundle: { summaryPdf: Buffer };
    folderPath: string;
  }) => archive.append(bundle.summaryPdf, { name: `${folderPath}/00-summary.pdf` }),
}));

const mockLoadDocumentBundle = jest.fn();
jest.mock('./framework-evidence-documents', () => ({
  loadDocumentBundle: (...args: unknown[]) => mockLoadDocumentBundle(...args),
  appendDocumentEvidence: async ({
    archive,
    bundle,
    folderPath,
  }: {
    archive: { append: (source: unknown, options: { name: string }) => void };
    bundle: { csv: string };
    folderPath: string;
  }) => archive.append(bundle.csv, { name: `${folderPath}/submissions.csv` }),
}));

const mockLoadNatives = jest.fn();
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));
jest.mock('../../soa/soa.service', () => ({ SOAService: jest.fn() }));
jest.mock('../../app/s3', () => ({ BUCKET_NAME: 'bucket', getObjectAsBuffer: jest.fn() }));
jest.mock('../../isms/utils/export-payload', () => ({
  parseExportSnapshot: jest.fn(),
  renderSnapshot: jest.fn(),
}));
jest.mock('./framework-evidence-native', () => ({
  ...jest.requireActual('./framework-evidence-native'),
  loadNativeArtifacts: (...args: unknown[]) => mockLoadNatives(...args),
}));

import { FrameworkEvidenceExportService } from './framework-evidence-export.service';

const RISK_MANAGEMENT_TEMPLATE = 'frk_ct_683f484fc7b5506ab97c26af';

function natives(overrides: Record<string, unknown> = {}) {
  return {
    isms: [
      {
        title: 'Risk Treatment Plan',
        fileName: 'Risk Treatment Plan v2.pdf',
        version: 2,
        requirementId: 'r3',
        controlIds: new Set<string>(),
        pdf: Buffer.from('isms'),
      },
    ],
    unpublishedIsms: ['ISMS Scope'],
    soa: null,
    registers: new Map([['risks', 'risk-csv']]),
    omittedRegisters: ['people'],
    soaOmitted: false,
    ...overrides,
  };
}

const renderer = { renderPoliciesPdfBuffer: jest.fn(() => Buffer.from('policy-pdf')) };

function requirement(id: string, identifier: string, name: string) {
  return { id, identifier, name, description: '', frameworkId: 'frk_1', customFrameworkId: null, kind: 'platform' };
}

function mapping(
  requirementId: string,
  links: { policyId?: string; taskId?: string; formType?: string; templateId?: string },
) {
  return {
    requirementId,
    customRequirementId: null,
    control: {
      id: `ctl_${requirementId}`,
      controlTemplateId: links.templateId ?? null,
      name: `Control ${links.policyId ?? ''}${links.taskId ?? ''}${links.formType ?? ''}`,
      frameworkPolicyLinks: links.policyId ? [{ policyId: links.policyId }] : [],
      frameworkTaskLinks: links.taskId ? [{ taskId: links.taskId }] : [],
      frameworkDocumentLinks: links.formType ? [{ formType: links.formType }] : [],
    },
  };
}

describe('FrameworkEvidenceExportService', () => {
  const service = new FrameworkEvidenceExportService(
    renderer as unknown as ConstructorParameters<typeof FrameworkEvidenceExportService>[0],
  );

  beforeEach(() => {
    jest.clearAllMocks();
    appendCalls.length = 0;
    mockDb.frameworkInstance.findFirst.mockResolvedValue({
      id: 'frm_1',
      frameworkId: 'frk_1',
      customFrameworkId: null,
      currentVersionId: 'fv_1',
      framework: { name: 'PCI DSS Level 1' },
      customFramework: null,
      organization: { name: 'Spare Payments', primaryColor: null },
    });
    mockLoadRequirements.mockResolvedValue([
      requirement('r1', '1.1.1', 'Security policies are documented.'),
      requirement('r2', '2.1.1', 'Secure configuration'),
      requirement('r3', '3.1', 'Nothing mapped yet'),
    ]);
    mockDb.requirementMap.findMany.mockResolvedValue([
      mapping('r1', { policyId: 'pol_1', taskId: 'tsk_1' }),
      mapping('r2', { policyId: 'pol_1', formType: 'rbac_matrix', templateId: RISK_MANAGEMENT_TEMPLATE }),
      mapping('r2', { formType: 'network_diagram' }),
    ]);
    mockDb.evidenceFormSetting.findMany.mockResolvedValue([{ formType: 'network_diagram' }]);
    mockDb.policy.findMany.mockResolvedValue([
      { id: 'pol_1', name: 'Information Security Policy', content: [], pdfUrl: null, currentVersion: null },
    ]);
    mockLoadTaskBundle.mockResolvedValue({ title: 'Access Review', summaryPdf: Buffer.from('task') });
    mockLoadDocumentBundle.mockResolvedValue({ title: 'RBAC Matrix', csv: 'a,b', files: [] });
    mockLoadNatives.mockResolvedValue(natives());
  });

  async function exportNames(): Promise<string[]> {
    const framework = await service.loadFramework('org_1', 'frm_1');
    expect(framework.root).toMatch(/^spare-payments_pci-dss-level-1_evidence_\d{4}-\d{2}-\d{2}$/);
    await service.populate({
      archive: archive as unknown as Parameters<typeof service.populate>[0]['archive'],
      organizationId: 'org_1',
      framework,
    });
    // The caller (the export job) finalizes the archive.
    expect(archive.finalize).not.toHaveBeenCalled();
    return appendCalls.map((call) => call.name.split('/').slice(1).join('/'));
  }

  it('puts each requirement in its own folder with its policies, tasks and documents', async () => {
    const names = await exportNames();

    expect(names).toEqual([
      'README.txt',
      '_Platform records/ISMS/Risk Treatment Plan v2.pdf',
      '_Platform records/Registers/risk-register.csv',
      '1.1.1 Security policies are documented/00-requirement.txt',
      '1.1.1 Security policies are documented/Policies/Information Security Policy.pdf',
      '1.1.1 Security policies are documented/Tasks/Access Review/00-summary.pdf',
      '2.1.1 Secure configuration/00-requirement.txt',
      '2.1.1 Secure configuration/Policies/Information Security Policy.pdf',
      '2.1.1 Secure configuration/Documents/RBAC Matrix/submissions.csv',
      '2.1.1 Secure configuration/Registers/risk-register.csv',
      '3.1 Nothing mapped yet/00-requirement.txt',
      '3.1 Nothing mapped yet/ISMS/Risk Treatment Plan v2.pdf',
      'index.csv',
      'native-artifacts.csv',
    ]);
  });

  it('skips document types marked not relevant and renders each policy once', async () => {
    await exportNames();

    expect(mockLoadDocumentBundle).toHaveBeenCalledTimes(1);
    expect(mockLoadDocumentBundle).toHaveBeenCalledWith({
      organizationId: 'org_1',
      formType: 'rbac_matrix',
      period: {},
    });
    expect(renderer.renderPoliciesPdfBuffer).toHaveBeenCalledTimes(1);
  });

  it('streams an uploaded policy PDF instead of rendering it', async () => {
    mockDb.policy.findMany.mockResolvedValue([
      { id: 'pol_1', name: 'Information Security Policy', content: [], pdfUrl: 'org_1/policy.pdf', currentVersion: null },
    ]);

    await exportNames();

    expect(renderer.renderPoliciesPdfBuffer).not.toHaveBeenCalled();
    expect(mockAppendAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: { id: 'pol_1', name: 'Information Security Policy.pdf', url: 'org_1/policy.pdf' },
      }),
    );
  });

  it('lists every requirement in index.csv', async () => {
    await exportNames();

    const index = appendCalls.find((call) => call.name.endsWith('/index.csv'));
    expect(String(index?.source).split('\n')).toEqual([
      '"requirement","name","folder","controls","policies","tasks","documents","isms_documents","registers"',
      '"1.1.1","Security policies are documented.","1.1.1 Security policies are documented","1","1","1","0","0","0"',
      '"2.1.1","Secure configuration","2.1.1 Secure configuration","2","1","0","1","0","1"',
      '"3.1","Nothing mapped yet","3.1 Nothing mapped yet","0","0","0","0","1","0"',
    ]);
  });

  it('indexes every native artifact with the files it was placed in', async () => {
    await exportNames();

    const index = appendCalls.find((call) => call.name.endsWith('/native-artifacts.csv'));
    expect(String(index?.source).split('\n')).toEqual([
      '"type","artifact","detail","files"',
      '"ISMS document","Risk Treatment Plan","published v2","_Platform records/ISMS/Risk Treatment Plan v2.pdf | 3.1 Nothing mapped yet/ISMS/Risk Treatment Plan v2.pdf"',
      '"Register","Risk register","snapshot at export time","_Platform records/Registers/risk-register.csv | 2.1.1 Secure configuration/Registers/risk-register.csv"',
    ]);
  });

  it('names unpublished ISMS documents, omitted registers and the audit period in the README', async () => {
    const framework = await service.loadFramework('org_1', 'frm_1');
    await service.populate({
      archive: archive as unknown as Parameters<typeof service.populate>[0]['archive'],
      organizationId: 'org_1',
      framework,
      access: { registers: ['risks'], soa: false },
      period: { from: new Date('2026-01-01T00:00:00Z') },
    });

    expect(mockLoadNatives).toHaveBeenCalledWith({
      organizationId: 'org_1',
      frameworkId: 'frk_1',
      access: { registers: ['risks'], soa: false },
    });
    expect(mockLoadTaskBundle).toHaveBeenCalledWith({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      period: { from: new Date('2026-01-01T00:00:00Z') },
    });
    const readme = String(appendCalls.find((c) => c.name.endsWith('/README.txt'))?.source);
    expect(readme).toContain('Audit period: 2026-01-01 to today');
    expect(readme).toContain('  - ISMS Scope');
    expect(readme).toContain('  - People population');
  });

  it('puts the SoA in the 6.1.3 folder and appends offboarding evidence when allowed', async () => {
    mockLoadRequirements.mockResolvedValue([requirement('r9', '6.1.3', 'Risk treatment')]);
    mockLoadNatives.mockResolvedValue(
      natives({
        isms: [],
        registers: new Map([['offboarding', 'off-csv']]),
        soa: { fileName: 'Statement of Applicability v1.pdf', status: 'completed', pdf: Buffer.from('soa') },
      }),
    );
    const offboardingExport = { appendAllOffboardings: jest.fn() };

    const framework = await service.loadFramework('org_1', 'frm_1');
    await service.populate({
      archive: archive as unknown as Parameters<typeof service.populate>[0]['archive'],
      organizationId: 'org_1',
      framework,
      offboardingExport: offboardingExport as unknown as NonNullable<
        Parameters<typeof service.populate>[0]['offboardingExport']
      >,
    });

    const names = appendCalls.map((c) => c.name.split('/').slice(1).join('/'));
    expect(names).toContain('_Platform records/ISMS/Statement of Applicability v1.pdf');
    expect(names).toContain('6.1.3 Risk treatment/ISMS/Statement of Applicability v1.pdf');
    expect(offboardingExport.appendAllOffboardings).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        prefix: expect.stringMatching(/_Platform records\/Offboarding evidence\/$/),
      }),
    );
  });

  it('rejects a framework from another organization', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);

    await expect(service.loadFramework('org_2', 'frm_1')).rejects.toThrow(NotFoundException);
    expect(mockDb.frameworkInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'frm_1', organizationId: 'org_2' } }),
    );
  });
});
