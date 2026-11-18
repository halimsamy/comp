import { describe, expect, it } from 'vitest';
import { toFormValues, toUpdatePayload, tpspProfileSchema } from './tpsp-profile-form';

describe('TPSP profile form mapping', () => {
  it('round-trips vendor fields and clears empty values', () => {
    const values = toFormValues({
      criticality: 'high',
      handlesCardholderData: true,
      dataTypes: ['cardholder_data'],
      contractEndDate: '2027-01-31T00:00:00.000Z',
      assuranceType: null,
    });
    expect(values.criticality).toBe('high');
    expect(values.contractEndDate).toBe('2027-01-31');
    expect(values.assuranceType).toBe('unset');

    const payload = toUpdatePayload(values);
    expect(payload).toMatchObject({
      criticality: 'high',
      handlesCardholderData: true,
      dataTypes: ['cardholder_data'],
      contractEndDate: '2027-01-31T00:00:00.000Z',
      contractStartDate: null,
      assuranceType: null,
    });
  });

  it('rejects a contract that ends before it starts', () => {
    const values = {
      ...toFormValues({}),
      contractStartDate: '2027-01-01',
      contractEndDate: '2026-01-01',
    };
    const result = tpspProfileSchema.safeParse(values);
    expect(result.success).toBe(false);
  });
});
