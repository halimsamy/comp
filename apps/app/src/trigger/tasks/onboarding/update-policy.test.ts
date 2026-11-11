import { describe, expect, it, vi } from 'vitest';

// update-policy.ts registers a job at import time and pulls in the policy pipeline.
vi.mock('@trycompai/jobs', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  metadata: {},
  queue: (opts: unknown) => opts,
  schemaTask: (opts: unknown) => opts,
}));
vi.mock('./update-policies-helpers', () => ({ processPolicyUpdate: vi.fn() }));

import { updatePolicyPayloadSchema } from './update-policy';

describe('updatePolicyPayloadSchema', () => {
  it('accepts framework dates as the ISO strings a JSON job payload carries', () => {
    const parsed = updatePolicyPayloadSchema.parse({
      organizationId: 'org_1',
      policyId: 'pol_1',
      contextHub: 'context',
      frameworks: [
        {
          id: 'frk_1',
          name: 'ISO 27001',
          version: '2022',
          description: 'ISMS',
          visible: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    });

    expect(parsed.frameworks[0]!.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(parsed.frameworks[0]!.updatedAt).toBeInstanceOf(Date);
  });
});
