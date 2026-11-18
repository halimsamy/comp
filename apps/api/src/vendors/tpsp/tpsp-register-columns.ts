import type { Prisma, Vendor } from '@db';

/** Extra vendor-register CSV columns for the PCI DSS 12.8.1 TPSP list. */
export const TPSP_REGISTER_HEADERS = [
  'Criticality',
  'Shares account data (12.8.1)',
  'Can affect CDE security (12.8.1)',
  'Data types',
  'Contract start',
  'Contract end',
  'Security clauses (A.5.20)',
  'Confidentiality clauses (A.5.20)',
  'TPSP written acknowledgement (12.8.2)',
  'Responsibility matrix (12.8.5)',
  'Assurance',
  'Assurance period end',
  'Assurance expires',
  'PCI DSS status',
  'PCI DSS status checked (12.8.4)',
  'Last reviewed',
  'Next review due',
];

const label = (value: string | null) => (value ? value.replace(/_/g, ' ') : '');

/** "8.4 MFA: shared; 10.2 Logging: tpsp" */
export function formatResponsibilityMatrix(matrix: Prisma.JsonValue): string {
  if (!Array.isArray(matrix)) return '';
  return matrix
    .filter(
      (row): row is { requirement: string; owner: string } =>
        typeof row === 'object' &&
        row !== null &&
        !Array.isArray(row) &&
        typeof row.requirement === 'string' &&
        typeof row.owner === 'string',
    )
    .map((row) => `${row.requirement}: ${row.owner}`)
    .join('; ');
}

export function tpspRegisterCells(vendor: Vendor) {
  return [
    label(vendor.criticality),
    vendor.handlesCardholderData,
    vendor.affectsCdeSecurity,
    // Tolerates rows/fixtures built before the TPSP columns existed.
    (vendor.dataTypes ?? []).map(label).join('; '),
    vendor.contractStartDate,
    vendor.contractEndDate,
    vendor.securityClausesConfirmed,
    vendor.confidentialityClausesConfirmed,
    vendor.tpspAcknowledgementDate,
    formatResponsibilityMatrix(vendor.responsibilityMatrix),
    label(vendor.assuranceType),
    vendor.assurancePeriodEnd,
    vendor.assuranceExpiresAt,
    label(vendor.pciStatus),
    vendor.pciStatusCheckedAt,
    vendor.lastReviewedAt,
    vendor.nextReviewDue,
  ];
}
