import { NotFoundException } from '@nestjs/common';

type AppendCall = { source: unknown; name: string };
const appendCalls: AppendCall[] = [];
let resolveFinalized: () => void = () => {};
let finalized: Promise<void>;

jest.mock('archiver', () =>
  jest.fn(() => {
    finalized = new Promise<void>((resolve) => {
      resolveFinalized = resolve;
    });
    const archive = {
      append: jest.fn((source: unknown, options: { name: string }) => {
        appendCalls.push({ source, name: options.name });
        return archive;
      }),
      finalize: jest.fn(async () => resolveFinalized()),
      abort: jest.fn(),
      on: jest.fn(() => archive),
    };
    return archive;
  }),
);

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

import { FrameworkEvidenceExportService } from './framework-evidence-export.service';

const renderer = { renderPoliciesPdfBuffer: jest.fn(() => Buffer.from('policy-pdf')) };

function requirement(id: string, identifier: string, name: string) {
  return { id, identifier, name, description: '', frameworkId: 'frk_1', customFrameworkId: null, kind: 'platform' };
}

function mapping(requirementId: string, links: { policyId?: string; taskId?: string; formType?: string }) {
  return {
    requirementId,
    customRequirementId: null,
    control: {
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
      mapping('r2', { policyId: 'pol_1', formType: 'rbac_matrix' }),
      mapping('r2', { formType: 'network_diagram' }),
    ]);
    mockDb.evidenceFormSetting.findMany.mockResolvedValue([{ formType: 'network_diagram' }]);
    mockDb.policy.findMany.mockResolvedValue([
      { id: 'pol_1', name: 'Information Security Policy', content: [], pdfUrl: null, currentVersion: null },
    ]);
    mockLoadTaskBundle.mockResolvedValue({ title: 'Access Review', summaryPdf: Buffer.from('task') });
    mockLoadDocumentBundle.mockResolvedValue({ title: 'RBAC Matrix', csv: 'a,b', files: [] });
  });

  async function exportNames(): Promise<string[]> {
    const { filename } = await service.streamFrameworkEvidenceZip('org_1', 'frm_1');
    await finalized;
    expect(filename).toMatch(/^spare-payments_pci-dss-level-1_evidence_\d{4}-\d{2}-\d{2}\.zip$/);
    return appendCalls.map((call) => call.name.split('/').slice(1).join('/'));
  }

  it('puts each requirement in its own folder with its policies, tasks and documents', async () => {
    const names = await exportNames();

    expect(names).toEqual([
      'README.txt',
      '1.1.1 Security policies are documented/00-requirement.txt',
      '1.1.1 Security policies are documented/Policies/Information Security Policy.pdf',
      '1.1.1 Security policies are documented/Tasks/Access Review/00-summary.pdf',
      '2.1.1 Secure configuration/00-requirement.txt',
      '2.1.1 Secure configuration/Policies/Information Security Policy.pdf',
      '2.1.1 Secure configuration/Documents/RBAC Matrix/submissions.csv',
      '3.1 Nothing mapped yet/00-requirement.txt',
      'index.csv',
    ]);
  });

  it('skips document types marked not relevant and renders each policy once', async () => {
    await exportNames();

    expect(mockLoadDocumentBundle).toHaveBeenCalledTimes(1);
    expect(mockLoadDocumentBundle).toHaveBeenCalledWith({ organizationId: 'org_1', formType: 'rbac_matrix' });
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
      '"requirement","name","folder","controls","policies","tasks","documents"',
      '"1.1.1","Security policies are documented.","1.1.1 Security policies are documented","1","1","1","0"',
      '"2.1.1","Secure configuration","2.1.1 Secure configuration","2","1","0","1"',
      '"3.1","Nothing mapped yet","3.1 Nothing mapped yet","0","0","0","0"',
    ]);
  });

  it('rejects a framework from another organization', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);

    await expect(service.streamFrameworkEvidenceZip('org_2', 'frm_1')).rejects.toThrow(NotFoundException);
    expect(mockDb.frameworkInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'frm_1', organizationId: 'org_2' } }),
    );
  });
});
