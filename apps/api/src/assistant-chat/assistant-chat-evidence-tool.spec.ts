const mockFindMany = jest.fn();
jest.mock('@db', () => ({
  db: {
    evidenceSubmission: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { toDbEvidenceFormType } from '@trycompai/company';
import { buildEvidenceTool } from './assistant-chat-evidence-tool';

const auditor = {
  organizationId: 'org_1',
  permissions: { evidence: ['read'] },
  roles: ['auditor'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getEvidenceSubmissions', () => {
  it('is not offered without evidence:read', () => {
    expect(
      buildEvidenceTool({ ...auditor, permissions: { risk: ['read'] } }),
    ).toBeUndefined();
  });

  it('is not offered to a custom role that has evidence:read but no reviewer role, like the evidence-forms API', () => {
    expect(
      buildEvidenceTool({ ...auditor, roles: ['compliance-viewer'] }),
    ).toBeUndefined();
  });

  it('refuses confidential HR form types', () => {
    const tool = buildEvidenceTool(auditor)!;

    for (const formType of [
      'whistleblower-report',
      'employee-performance-evaluation',
    ]) {
      expect(tool.inputSchema.safeParse({ formType }).success).toBe(false);
    }
    expect(
      tool.inputSchema.safeParse({ formType: 'infrastructure-inventory' })
        .success,
    ).toBe(true);
  });

  it('returns the latest submissions for the org with field labels and file names only', async () => {
    mockFindMany.mockResolvedValue([
      {
        submittedAt: new Date('2026-11-01T00:00:00Z'),
        status: 'approved',
        submittedBy: { name: 'Halim' },
        data: {
          submissionDate: '2026-11-01',
          inventoryRows: [
            {
              assetId: 'db-1',
              systemType: 'PostgreSQL',
              environment: 'production',
              assignedOwner: 'Platform',
              lastReviewed: '2026-10-01',
            },
          ],
          attachment: {
            fileName: 'export.xlsx',
            fileKey: 'org_1/evidence/export.xlsx',
            downloadUrl: 'https://files.example/signed',
          },
        },
      },
    ]);

    const result = await buildEvidenceTool(auditor)!.execute({
      formType: 'infrastructure-inventory',
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org_1',
          formType: toDbEvidenceFormType('infrastructure-inventory'),
        },
        orderBy: { submittedAt: 'desc' },
        take: 3,
      }),
    );
    expect(result).toMatchObject({
      form: 'Infrastructure Inventory',
      fields: expect.arrayContaining([
        expect.objectContaining({
          key: 'inventoryRows',
          columns: expect.arrayContaining([
            { key: 'assignedOwner', label: 'Assigned Owner' },
          ]),
        }),
      ]),
      submissions: [
        {
          submittedAt: '2026-11-01T00:00:00.000Z',
          status: 'approved',
          submittedBy: 'Halim',
          data: {
            inventoryRows: [expect.objectContaining({ assetId: 'db-1' })],
            attachment: { uploadedFile: 'export.xlsx' },
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('files.example');
  });

  it('says so when nothing has been submitted', async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(
      buildEvidenceTool(auditor)!.execute({ formType: 'rbac-matrix' }),
    ).resolves.toMatchObject({
      submissions: [],
      message: expect.stringContaining('No'),
    });
  });
});
