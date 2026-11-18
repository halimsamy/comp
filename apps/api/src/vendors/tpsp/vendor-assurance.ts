import type { VendorAssuranceType, VendorDocumentType } from '@db';
import { addMonths } from './vendor-review-status';

/** Document types that count as the vendor's independent assurance. */
const ASSURANCE_BY_DOCUMENT: Partial<
  Record<VendorDocumentType, VendorAssuranceType>
> = {
  soc2_type1: 'soc2_type1',
  soc2_type2: 'soc2_type2',
  iso27001_certificate: 'iso27001',
  pci_aoc: 'pci_aoc',
};

/** Reports the AI can summarize (opinion, exceptions, CUECs, scope). */
export const SUMMARIZABLE_DOCUMENT_TYPES: readonly VendorDocumentType[] = [
  'soc2_type1',
  'soc2_type2',
  'iso27001_certificate',
  'pci_aoc',
  'pentest_report',
];

/**
 * Explicit expiry wins; otherwise an assurance report is treated as current for
 * 12 months after its period ends (bridge-letter convention for SOC 2 / AOC).
 */
export function resolveDocumentExpiry({
  type,
  periodEnd,
  expiresAt,
}: {
  type: VendorDocumentType;
  periodEnd: Date | null;
  expiresAt: Date | null;
}): Date | null {
  if (expiresAt) return expiresAt;
  if (periodEnd && ASSURANCE_BY_DOCUMENT[type]) {
    return addMonths({ date: periodEnd, months: 12 });
  }
  return null;
}

/**
 * Vendor assurance fields to set from a newly saved document, or null when the
 * document is not an assurance report or is older than what the vendor has.
 */
export function assuranceFromDocument({
  document,
  vendor,
}: {
  document: {
    type: VendorDocumentType;
    periodStart: Date | null;
    periodEnd: Date | null;
    expiresAt: Date | null;
  };
  vendor: { assuranceExpiresAt: Date | null };
}) {
  const assuranceType = ASSURANCE_BY_DOCUMENT[document.type];
  if (!assuranceType || !document.expiresAt) return null;
  if (
    vendor.assuranceExpiresAt &&
    vendor.assuranceExpiresAt.getTime() > document.expiresAt.getTime()
  ) {
    return null;
  }
  return {
    assuranceType,
    assurancePeriodStart: document.periodStart,
    assurancePeriodEnd: document.periodEnd,
    assuranceExpiresAt: document.expiresAt,
  };
}
