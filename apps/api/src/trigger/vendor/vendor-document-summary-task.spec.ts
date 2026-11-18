import { db } from '@db';
import { generateObject } from 'ai';
import { vendorDocumentSummaryTask } from './vendor-document-summary-task';

jest.mock('@db', () => ({
  db: {
    vendorDocument: { findFirst: jest.fn(), update: jest.fn() },
    vendor: { update: jest.fn() },
  },
}));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  queue: jest.fn((options: unknown) => options),
  schemaTask: jest.fn((options: unknown) => options),
  tags: { add: jest.fn() },
}));
jest.mock('@/app/s3', () => ({
  BUCKET_NAME: 'bucket',
  s3Client: {
    send: jest.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([37, 80]) },
    }),
  },
}));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn() }));
jest.mock('ai', () => ({ generateObject: jest.fn() }));

const run = (
  vendorDocumentSummaryTask as unknown as {
    run: (payload: {
      documentId: string;
      organizationId: string;
    }) => Promise<{ success: boolean; reason?: string }>;
  }
).run;

const mocked = db as unknown as {
  vendorDocument: { findFirst: jest.Mock; update: jest.Mock };
  vendor: { update: jest.Mock };
};

const baseDocument = {
  id: 'vdoc_1',
  type: 'soc2_type2',
  periodStart: null,
  periodEnd: null,
  expiresAt: null,
  attachment: { name: 'soc2.pdf', url: 'org_1/vnd_1/soc2.pdf' },
  vendor: { id: 'vnd_1', name: 'Stripe', assuranceExpiresAt: null },
};

describe('vendorDocumentSummaryTask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the lookup to the organization', async () => {
    mocked.vendorDocument.findFirst.mockResolvedValue(null);
    await expect(
      run({ documentId: 'vdoc_1', organizationId: 'org_1' }),
    ).resolves.toEqual({ success: false, reason: 'not_found' });
    expect(mocked.vendorDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vdoc_1', organizationId: 'org_1' },
      }),
    );
  });

  it('fills missing dates from the report and refreshes vendor assurance', async () => {
    mocked.vendorDocument.findFirst.mockResolvedValue(baseDocument);
    (generateObject as jest.Mock).mockResolvedValue({
      object: {
        periodStart: '2025-04-01',
        periodEnd: '2026-03-31',
        expiresAt: null,
        opinion: 'unqualified',
      },
    });

    await expect(
      run({ documentId: 'vdoc_1', organizationId: 'org_1' }),
    ).resolves.toEqual({ success: true });

    expect(mocked.vendorDocument.update).toHaveBeenCalledWith({
      where: { id: 'vdoc_1' },
      data: expect.objectContaining({
        aiSummaryStatus: 'completed',
        periodEnd: new Date('2026-03-31'),
        // 12 months after the period end (assurance report default).
        expiresAt: new Date('2027-03-31'),
      }),
    });
    expect(mocked.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vnd_1' },
      data: expect.objectContaining({ assuranceType: 'soc2_type2' }),
    });
  });

  it('marks the summary failed for unsupported files without calling the model', async () => {
    mocked.vendorDocument.findFirst.mockResolvedValue({
      ...baseDocument,
      attachment: { name: 'soc2.docx', url: 'x' },
    });
    await run({ documentId: 'vdoc_1', organizationId: 'org_1' });
    expect(generateObject).not.toHaveBeenCalled();
    expect(mocked.vendorDocument.update).toHaveBeenCalledWith({
      where: { id: 'vdoc_1' },
      data: { aiSummaryStatus: 'failed' },
    });
  });
});
