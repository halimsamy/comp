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
  control: { findMany: jest.fn() },
  auditEngagement: { findFirst: jest.fn() },
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

const mockListApplicability = jest.fn();
jest.mock('../../frameworks/applicability/requirement-applicability.service', () => ({
  RequirementApplicabilityService: jest.fn(() => ({ list: mockListApplicability })),
}));
const mockAppendRootRecords = jest.fn();
jest.mock('./framework-evidence-records', () => ({
  appendRootRecords: (...args: unknown[]) => mockAppendRootRecords(...args),
}));
const mockRenderWorksheet = jest.fn();
jest.mock('./record-pdf', () => ({
  renderRecordPdf: (...args: unknown[]) => mockRenderWorksheet(...args),
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
import {
  approvedPolicy,
  mapping,
  natives,
  renderer,
  requirement,
} from './framework-evidence-export.fixturespec';

const setAt = new Date('2026-02-01T00:00:00Z');
const by = { id: 'mem_1', user: { name: 'Ada', email: 'ada@spare.test' } };

describe('FrameworkEvidenceExportService: applicability, policies and audits', () => {
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
      requirement('r1', '9.5.1', 'POI devices are protected'),
      requirement('r2', '1.3.1', 'Inbound CDE traffic is restricted'),
      requirement('r3', '12.1.1', 'Security policy is published'),
    ]);
    mockDb.requirementMap.findMany.mockResolvedValue([
      mapping('r1', { policyId: 'pol_1', taskId: 'tsk_1' }),
      mapping('r2', { taskId: 'tsk_1', policyId: 'pol_1' }),
      mapping('r3', { policyId: 'pol_2' }),
    ]);
    mockDb.evidenceFormSetting.findMany.mockResolvedValue([]);
    mockDb.policy.findMany.mockResolvedValue([
      approvedPolicy(),
      approvedPolicy({ id: 'pol_2', name: 'Draft Remote Access Policy', versions: [] }),
    ]);
    mockDb.control.findMany.mockResolvedValue([{ id: 'ctl_x', name: 'Network segmentation' }]);
    mockDb.auditEngagement.findFirst.mockResolvedValue(null);
    mockListApplicability.mockResolvedValue({
      data: [
        { requirementKey: 'r1', status: 'not_applicable', justification: 'No POI devices', details: null, source: 'manual', updatedAt: setAt, updatedBy: by },
        {
          requirementKey: 'r2',
          status: 'compensating_control',
          justification: 'Segmentation compensates',
          details: {
            kind: 'compensating_control',
            constraints: 'Legacy switch',
            objective: 'Limit inbound traffic',
            identifiedRisk: 'Lateral movement',
            compensatingControlIds: ['ctl_x'],
            validation: 'Quarterly pentest',
            maintenance: 'Firewall review every 6 months',
            revalidateAt: '2026-12-01',
          },
          source: 'manual',
          updatedAt: setAt,
          updatedBy: by,
        },
      ],
      count: 2,
    });
    mockRenderWorksheet.mockReturnValue(Buffer.from('worksheet'));
    mockLoadTaskBundle.mockResolvedValue({ title: 'Firewall review', summaryPdf: Buffer.from('task'), attachments: [] });
    mockLoadDocumentBundle.mockResolvedValue({ title: 'Doc', csv: 'a,b', files: [] });
    mockLoadNatives.mockResolvedValue(natives({ isms: [], registers: new Map() }));
  });

  async function run(auditId?: string) {
    const framework = await service.loadFramework('org_1', 'frm_1');
    await service.populate({
      archive: archive as unknown as Parameters<typeof service.populate>[0]['archive'],
      organizationId: 'org_1',
      framework,
      auditId,
    });
    return appendCalls.map((call) => call.name.split('/').slice(1).join('/'));
  }
  const file = (suffix: string) => String(appendCalls.find((c) => c.name.endsWith(suffix))?.source);

  it('holds only the requirement and NOT_APPLICABLE.txt in a not-applicable folder', async () => {
    const names = await run();

    expect(names.filter((n) => n.startsWith('9.5.1'))).toEqual([
      '9.5.1 POI devices are protected/00-requirement.txt',
      '9.5.1 POI devices are protected/NOT_APPLICABLE.txt',
    ]);
    expect(file('9.5.1 POI devices are protected/00-requirement.txt')).toContain(
      'Applicability:\n  Status: Not applicable\n  Justification: No POI devices\n  Set by: Ada on 2026-02-01',
    );
    expect(file('NOT_APPLICABLE.txt')).toContain('No POI devices');
    // The task is still exported once, for the applicable 1.3.1.
    expect(names).toContain('1.3.1 Inbound CDE traffic is restricted/Tasks/Firewall review/00-summary.pdf');
  });

  it('renders a compensating controls worksheet from the structured details', async () => {
    const names = await run();

    expect(names).toContain('1.3.1 Inbound CDE traffic is restricted/CCW - 1.3.1.pdf');
    const [{ sections, title }] = mockRenderWorksheet.mock.calls[0];
    expect(title).toBe('Compensating Controls Worksheet - 1.3.1');
    expect(sections.map((s: { heading: string }) => s.heading)).toEqual([
      'Requirement number and definition',
      '1. Constraints',
      '2. Definition of compensating controls',
      '3. Objective',
      '4. Identified risk',
      '5. Validation of compensating controls',
      '6. Maintenance',
    ]);
    expect(sections[2].bullets).toEqual(['Network segmentation']);
    expect(mockDb.control.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', id: { in: ['ctl_x'] } } }),
    );
  });

  it('adds applicability columns to index.csv and the root summary', async () => {
    await run();

    expect(file('/index.csv').split('\n')[2]).toMatch(
      /"In place with compensating controls \(PCI DSS Appendix B\/C\)","Segmentation compensates","Ada","2026-02-01"$/,
    );
    expect(file('Applicability summary.csv').split('\n')).toEqual([
      '"requirement","name","applicability","justification","set_by","set_at"',
      '"9.5.1","POI devices are protected","Not applicable","No POI devices","Ada","2026-02-01"',
      '"1.3.1","Inbound CDE traffic is restricted","In place with compensating controls (PCI DSS Appendix B/C)","Segmentation compensates","Ada","2026-02-01"',
      '"12.1.1","Security policy is published","Applicable","","",""',
    ]);
  });

  it('exports approved policies only and lists the unapproved ones in the README', async () => {
    const names = await run();

    expect(names.some((n) => n.includes('Draft Remote Access Policy'))).toBe(false);
    expect(file('README.txt')).toContain('Policies not approved (not included):\n  - Draft Remote Access Policy');
    expect(mockDb.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', isArchived: false, id: { in: ['pol_1', 'pol_2'] } },
      }),
    );
    expect(renderer.renderPoliciesPdfBuffer).toHaveBeenCalledWith(
      [expect.objectContaining({ documentControl: expect.arrayContaining([{ label: 'Version', value: 'v3' }]) })],
      'Spare Payments',
      null,
    );
  });

  it('adds the audit trail and requests only for an audit of this framework', async () => {
    mockDb.auditEngagement.findFirst.mockResolvedValue({ id: 'aud_1', title: 'PCI ROC 2026' });

    await run('aud_1');

    expect(mockDb.auditEngagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'aud_1', organizationId: 'org_1', frameworkInstanceId: 'frm_1' } }),
    );
    expect(mockAppendRootRecords).toHaveBeenCalledWith(expect.objectContaining({ auditId: 'aud_1' }));
    expect(file('README.txt')).toContain('Audit: PCI ROC 2026.');
  });
});
