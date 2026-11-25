/**
 * Module mocks shared by the framework evidence export service specs (named *spec.ts
 * so builds skip it). Import it before the service so its jest.mock calls apply.
 */
import { mapping, natives, approvedPolicy, RISK_MANAGEMENT_TEMPLATE, requirement } from './framework-evidence-export.fixturespec';

type AppendCall = { source: unknown; name: string };
export const appendCalls: AppendCall[] = [];
export const archive = {
  append: jest.fn((source: unknown, options: { name: string }) => {
    appendCalls.push({ source, name: options.name });
    return archive;
  }),
  finalize: jest.fn(),
};

export const mockDb = {
  frameworkInstance: { findFirst: jest.fn() },
  requirementMap: { findMany: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  policy: { findMany: jest.fn() },
  control: { findMany: jest.fn() },
  auditEngagement: { findFirst: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

export const mockLoadRequirements = jest.fn();
jest.mock('../../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: (...args: unknown[]) => mockLoadRequirements(...args),
}));

export const mockAppendAttachment = jest.fn();
jest.mock('./evidence-attachment-streamer', () => ({
  ...jest.requireActual('./evidence-attachment-streamer'),
  appendAttachmentToArchive: (...args: unknown[]) => mockAppendAttachment(...args),
}));

export const mockLoadTaskBundle = jest.fn();
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

export const mockLoadDocumentBundle = jest.fn();
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

export const mockListApplicability = jest.fn();
jest.mock('../../frameworks/applicability/requirement-applicability.service', () => ({
  RequirementApplicabilityService: jest.fn(() => ({ list: mockListApplicability })),
}));
export const mockAppendRootRecords = jest.fn();
jest.mock('./framework-evidence-records', () => ({
  appendRootRecords: (...args: unknown[]) => mockAppendRootRecords(...args),
}));
export const mockRenderWorksheet = jest.fn();
jest.mock('./record-pdf', () => ({
  renderRecordPdf: (...args: unknown[]) => mockRenderWorksheet(...args),
}));

export const mockLoadNatives = jest.fn();
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

/** Default export fixtures: three PCI requirements, one policy, task and document. */
export function resetExportMocks(): void {
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
  mockDb.policy.findMany.mockResolvedValue([approvedPolicy()]);
  mockDb.control.findMany.mockResolvedValue([{ id: 'ctl_x', name: 'Network segmentation' }]);
  mockDb.auditEngagement.findFirst.mockResolvedValue(null);
  mockListApplicability.mockResolvedValue({ data: [], count: 0 });
  mockRenderWorksheet.mockReturnValue(Buffer.from('worksheet'));
  mockLoadTaskBundle.mockResolvedValue({ title: 'Access Review', summaryPdf: Buffer.from('task'), attachments: [] });
  mockLoadDocumentBundle.mockResolvedValue({ title: 'RBAC Matrix', csv: 'a,b', files: [] });
  mockLoadNatives.mockResolvedValue(natives());
}
