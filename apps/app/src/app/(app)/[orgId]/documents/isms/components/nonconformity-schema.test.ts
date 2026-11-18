import { describe, expect, it } from 'vitest';
import { nonconformitySchema, toFormValues, toPayload } from './nonconformity-schema';

const base = { ...toFormValues(null), description: 'Access review skipped in Q2' };

describe('nonconformitySchema', () => {
  it('accepts an open nonconformity with only a description', () => {
    expect(nonconformitySchema.safeParse(base).success).toBe(true);
  });

  it('requires a corrective action before closing (ISO 27001 10.2 c)', () => {
    const result = nonconformitySchema.safeParse({ ...base, status: 'closed' });
    expect(result.success).toBe(false);
    expect(
      nonconformitySchema.safeParse({
        ...base,
        status: 'closed',
        correctiveAction: 'Re-ran review',
      }).success,
    ).toBe(true);
  });

  it('requires a reviewer when an effectiveness review date is set', () => {
    const result = nonconformitySchema.safeParse({
      ...base,
      effectivenessReviewedAt: '2026-11-01',
    });
    expect(result.success).toBe(false);
  });

  it('sends empty fields as null so the API clears them', () => {
    const payload = toPayload({ ...base, rootCause: '  ' });
    expect(payload.rootCause).toBeNull();
    expect(payload.description).toBe('Access review skipped in Q2');
  });
});
