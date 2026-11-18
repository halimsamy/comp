import type { UpdateVendorTpspData, VendorTpspFields } from '@/hooks/use-vendors';
import { z } from 'zod';
import { fromDateInput, toDateInput } from '../../../lib/vendor-tpsp';

const dateField = z.string();
const UNSET = 'unset';

export const tpspProfileSchema = z
  .object({
    criticality: z.enum(['critical', 'high', 'medium', 'low', UNSET]),
    handlesCardholderData: z.boolean(),
    affectsCdeSecurity: z.boolean(),
    dataTypes: z.array(z.string()),
    contractStartDate: dateField,
    contractEndDate: dateField,
    securityClausesConfirmed: z.boolean(),
    confidentialityClausesConfirmed: z.boolean(),
    tpspAcknowledgementDate: dateField,
    assuranceType: z.enum([
      'soc2_type1',
      'soc2_type2',
      'iso27001',
      'pci_aoc',
      'pci_roc',
      'other',
      'none',
      UNSET,
    ]),
    assurancePeriodStart: dateField,
    assurancePeriodEnd: dateField,
    assuranceExpiresAt: dateField,
    pciStatus: z.enum([
      'compliant',
      'non_compliant',
      'in_progress',
      'not_applicable',
      'unknown',
      UNSET,
    ]),
    pciStatusCheckedAt: dateField,
    nextReviewDue: dateField,
  })
  .refine(
    (v) => !v.contractStartDate || !v.contractEndDate || v.contractStartDate <= v.contractEndDate,
    { message: 'Contract end must be after the start', path: ['contractEndDate'] },
  );

export type TpspProfileValues = z.infer<typeof tpspProfileSchema>;

export function toFormValues(vendor: Partial<VendorTpspFields>): TpspProfileValues {
  return {
    criticality: vendor.criticality ?? UNSET,
    handlesCardholderData: vendor.handlesCardholderData ?? false,
    affectsCdeSecurity: vendor.affectsCdeSecurity ?? false,
    dataTypes: vendor.dataTypes ?? [],
    contractStartDate: toDateInput(vendor.contractStartDate),
    contractEndDate: toDateInput(vendor.contractEndDate),
    securityClausesConfirmed: vendor.securityClausesConfirmed ?? false,
    confidentialityClausesConfirmed: vendor.confidentialityClausesConfirmed ?? false,
    tpspAcknowledgementDate: toDateInput(vendor.tpspAcknowledgementDate),
    assuranceType: vendor.assuranceType ?? UNSET,
    assurancePeriodStart: toDateInput(vendor.assurancePeriodStart),
    assurancePeriodEnd: toDateInput(vendor.assurancePeriodEnd),
    assuranceExpiresAt: toDateInput(vendor.assuranceExpiresAt),
    pciStatus: vendor.pciStatus ?? UNSET,
    pciStatusCheckedAt: toDateInput(vendor.pciStatusCheckedAt),
    nextReviewDue: toDateInput(vendor.nextReviewDue),
  };
}

const orNull = <T extends string>(value: T | typeof UNSET) => (value === UNSET ? null : value);

/** Form values → PATCH /v1/vendors/:id body. Empty dates clear the field. */
export function toUpdatePayload(values: TpspProfileValues): UpdateVendorTpspData {
  return {
    criticality: orNull(values.criticality),
    handlesCardholderData: values.handlesCardholderData,
    affectsCdeSecurity: values.affectsCdeSecurity,
    dataTypes: values.dataTypes,
    contractStartDate: fromDateInput(values.contractStartDate),
    contractEndDate: fromDateInput(values.contractEndDate),
    securityClausesConfirmed: values.securityClausesConfirmed,
    confidentialityClausesConfirmed: values.confidentialityClausesConfirmed,
    tpspAcknowledgementDate: fromDateInput(values.tpspAcknowledgementDate),
    assuranceType: orNull(values.assuranceType),
    assurancePeriodStart: fromDateInput(values.assurancePeriodStart),
    assurancePeriodEnd: fromDateInput(values.assurancePeriodEnd),
    assuranceExpiresAt: fromDateInput(values.assuranceExpiresAt),
    pciStatus: orNull(values.pciStatus),
    pciStatusCheckedAt: fromDateInput(values.pciStatusCheckedAt),
    nextReviewDue: fromDateInput(values.nextReviewDue),
  };
}
