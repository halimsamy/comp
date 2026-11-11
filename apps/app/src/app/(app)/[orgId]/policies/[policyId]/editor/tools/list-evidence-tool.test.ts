import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildListEvidenceTool } from './list-evidence-tool';

const apiCall = vi.fn();
const tool = buildListEvidenceTool({ apiCall });
const run = (input: { formType?: string }) =>
  tool.execute!(input as never, { toolCallId: 't1', messages: [] });

beforeEach(() => {
  apiCall.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listEvidence', () => {
  it('lists which forms were submitted, without confidential HR forms', async () => {
    apiCall.mockResolvedValue({
      'infrastructure-inventory': { lastSubmittedAt: '2026-11-01T00:00:00.000Z', isNotRelevant: false },
      'whistleblower-report': { lastSubmittedAt: '2026-10-01T00:00:00.000Z', isNotRelevant: false },
      authType: 'session',
    });

    const result = await run({});

    expect(apiCall).toHaveBeenCalledWith('/v1/evidence-forms/statuses');
    expect(result).toEqual({
      forms: {
        'infrastructure-inventory': {
          lastSubmittedAt: '2026-11-01T00:00:00.000Z',
          isNotRelevant: false,
        },
      },
    });
  });

  it('returns the latest submissions of a form with file names only', async () => {
    apiCall.mockResolvedValue({
      total: 1,
      submissions: [
        {
          submittedAt: '2026-11-01T00:00:00.000Z',
          status: 'approved',
          submittedBy: { name: 'Halim' },
          data: {
            pentestReport: {
              fileName: 'report.pdf',
              fileKey: 'org_1/report.pdf',
              downloadUrl: 'https://files.example/signed',
            },
            summary: 'No critical findings',
          },
        },
      ],
    });

    const result = await run({ formType: 'penetration-test' });

    expect(apiCall).toHaveBeenCalledWith('/v1/evidence-forms/penetration-test?limit=5');
    expect(result).toEqual({
      count: 1,
      evidence: [
        {
          submittedAt: '2026-11-01T00:00:00.000Z',
          status: 'approved',
          submittedBy: 'Halim',
          data: {
            pentestReport: { uploadedFile: 'report.pdf' },
            summary: 'No critical findings',
          },
        },
      ],
    });
  });

  it('refuses confidential HR form types', () => {
    const schema = tool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ formType: 'whistleblower-report' }).success).toBe(false);
    expect(schema.safeParse({ formType: 'employee-performance-evaluation' }).success).toBe(false);
    expect(schema.safeParse({ formType: 'rbac-matrix' }).success).toBe(true);
  });

  it('reports an API refusal instead of throwing', async () => {
    apiCall.mockRejectedValue(new Error('API error 401: Access denied'));

    await expect(run({ formType: 'rbac-matrix' })).resolves.toEqual({
      error: 'Could not load evidence: API error 401: Access denied',
    });
  });
});
