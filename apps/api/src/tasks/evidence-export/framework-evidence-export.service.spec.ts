import { NotFoundException } from '@nestjs/common';
import {
  appendCalls,
  archive,
  mockAppendAttachment,
  mockAppendRootRecords,
  mockDb,
  mockLoadDocumentBundle,
  mockLoadNatives,
  mockLoadRequirements,
  mockLoadTaskBundle,
  resetExportMocks,
} from './framework-evidence-export.mockspec';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';

import {
  approvedPolicy,
  mapping,
  natives,
  RISK_MANAGEMENT_TEMPLATE,
  renderer,
  requirement,
} from './framework-evidence-export.fixturespec';

describe('FrameworkEvidenceExportService', () => {
  const service = new FrameworkEvidenceExportService(
    renderer as unknown as ConstructorParameters<typeof FrameworkEvidenceExportService>[0],
  );

  beforeEach(() => resetExportMocks());

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
      '_Platform records/ISMS/Risk Treatment Plan v2.pdf',
      '_Platform records/Registers/risk-register.csv',
      '1.1.1 Security policies are documented/00-requirement.txt',
      '1.1.1 Security policies are documented/Policies/Information Security Policy v3.pdf',
      '1.1.1 Security policies are documented/Tasks/Access Review/00-summary.pdf',
      '2.1.1 Secure configuration/00-requirement.txt',
      '2.1.1 Secure configuration/Policies/Information Security Policy v3.pdf',
      '2.1.1 Secure configuration/Documents/RBAC Matrix/submissions.csv',
      '2.1.1 Secure configuration/Registers/risk-register.csv',
      '3.1 Nothing mapped yet/00-requirement.txt',
      '3.1 Nothing mapped yet/ISMS/Risk Treatment Plan v2.pdf',
      'index.csv',
      'Applicability summary.csv',
      'native-artifacts.csv',
      // README last, describing only what was written.
      'README.txt',
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
      approvedPolicy({
        versions: [{ ...approvedPolicy().versions[0], pdfUrl: 'org_1/policy.pdf' }],
      }),
    ]);

    await exportNames();

    expect(renderer.renderPoliciesPdfBuffer).not.toHaveBeenCalled();
    expect(mockAppendAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: { id: 'pol_1', name: 'Information Security Policy v3.pdf', url: 'org_1/policy.pdf' },
      }),
    );
  });

  it('lists every requirement in index.csv', async () => {
    await exportNames();

    const index = appendCalls.find((call) => call.name.endsWith('/index.csv'));
    expect(String(index?.source).split('\n')).toEqual([
      '"requirement","name","folder","controls","control_owners","policies","tasks","documents","isms_documents","registers","applicability","justification","set_by","set_at"',
      '"1.1.1","Security policies are documented.","1.1.1 Security policies are documented","1","","1","1","0","0","0","Applicable","","",""',
      '"2.1.1","Secure configuration","2.1.1 Secure configuration","2","","1","0","1","0","1","Applicable","","",""',
      '"3.1","Nothing mapped yet","3.1 Nothing mapped yet","0","","0","0","0","1","0","Applicable","","",""',
    ]);
  });

  it('names the owner of each mapped control in 00-requirement.txt and index.csv', async () => {
    const owned = mapping('r1', { policyId: 'pol_1' });
    mockDb.requirementMap.findMany.mockResolvedValue([
      { ...owned, control: { ...owned.control, owner: { user: { name: 'Ada', email: 'ada@spare.test' } } } },
      mapping('r1', { taskId: 'tsk_1' }),
    ]);
    await exportNames();

    const readme = String(appendCalls.find((c) => c.name.endsWith('1.1.1 Security policies are documented/00-requirement.txt'))?.source);
    expect(readme).toContain('  - Control pol_1 (owner: Ada)\n  - Control tsk_1 (owner: not assigned)');
    const index = String(appendCalls.find((c) => c.name.endsWith('/index.csv'))?.source);
    expect(index.split('\n')[1]).toMatch(/^"1.1.1","Security policies are documented.","1.1.1 Security policies are documented","2","Ada",/);
  });

  it('puts a scan report in its folder unless a document submission already holds it', async () => {
    mockLoadRequirements.mockResolvedValue([
      requirement('r1', '11.3.2', 'External scans'),
      requirement('r2', '11.4.3', 'External pentest'),
    ]);
    mockDb.requirementMap.findMany.mockResolvedValue([mapping('r2', { formType: 'penetration_test' })]);
    mockLoadDocumentBundle.mockResolvedValue({
      title: 'Penetration Test',
      csv: 'a,b',
      files: [{ id: 'evs_1', name: 'Pentest.pdf', url: 'org_1/pt.pdf' }],
    });
    const report = (key: string) => ({ name: `${key}.pdf`, key: `org_1/${key}.pdf`, pdf: Buffer.from(key) });
    const scan = { vendor: 'V', scannedAt: new Date('2026-10-29T00:00:00Z'), findingCount: 0 };
    mockLoadNatives.mockResolvedValue(
      natives({
        isms: [],
        scans: [
          { ...scan, id: 'vscan_1', kind: 'external_asv', passed: true, report: report('asv') },
          { ...scan, id: 'vscan_2', kind: 'pentest', passed: null, report: report('pt') },
        ],
      }),
    );

    const names = await exportNames();

    expect(names.filter((n) => n.includes('Vulnerability scans/'))).toEqual([
      '11.3.2 External scans/Vulnerability scans/asv.pdf',
      '11.3.2 External scans/Vulnerability scans/scans.csv',
      '11.4.3 External pentest/Vulnerability scans/scans.csv',
    ]);
    const readme = String(appendCalls.find((c) => c.name.endsWith('11.3.2 External scans/00-requirement.txt'))?.source);
    expect(readme).toContain('Vulnerability scan: ASV scan 2026-10-29 by V, passed');
    expect(String(appendCalls.find((c) => c.name.endsWith('/README.txt'))?.source)).toContain('"Vulnerability scans/"');
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
      frameworkName: 'PCI DSS Level 1',
      access: { registers: ['risks'], soa: false },
      period: { from: new Date('2026-01-01T00:00:00Z') },
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

  it('puts the SoA in the 6.1.3 folder and hands offboarding evidence to the root records', async () => {
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
    expect(mockAppendRootRecords).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', offboardingExport, auditId: undefined }),
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
