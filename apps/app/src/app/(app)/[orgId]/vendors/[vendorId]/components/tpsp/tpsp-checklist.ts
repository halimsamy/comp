import type { ResponsibilityMatrixRow, VendorTpspFields } from '@/hooks/use-vendors';
import { daysUntil } from '../../../lib/vendor-tpsp';

export interface TpspCheck {
  id: string;
  label: string;
  done: boolean;
}

/**
 * 12.8.5 is done only when every row was confirmed against the TPSP and each
 * shared requirement says how the work is split.
 */
export function isMatrixComplete(rows: ResponsibilityMatrixRow[] | null | undefined): boolean {
  if (!rows?.length) return false;
  return rows.every(
    (row) => row.confirmed && (row.owner !== 'shared' || Boolean(row.notes?.trim())),
  );
}

/**
 * What an auditor expects on file for this vendor. PCI-only items apply when
 * account data is shared or the vendor can affect the CDE (PCI DSS 12.8).
 */
export function tpspChecklist({
  vendor,
  now = new Date(),
}: {
  vendor: Partial<VendorTpspFields>;
  now?: Date;
}): TpspCheck[] {
  const inPciScope = Boolean(vendor.handlesCardholderData || vendor.affectsCdeSecurity);
  const assuranceValid = Boolean(
    vendor.assuranceType &&
    vendor.assuranceType !== 'none' &&
    (!vendor.assuranceExpiresAt || daysUntil({ date: vendor.assuranceExpiresAt, now }) >= 0),
  );
  // 12.8.4: a real status (not "unknown") checked within the last 12 months.
  const pciCheckedRecently = Boolean(
    vendor.pciStatus &&
    vendor.pciStatus !== 'unknown' &&
    vendor.pciStatusCheckedAt &&
    daysUntil({ date: vendor.pciStatusCheckedAt, now }) > -365,
  );
  const checks: (TpspCheck | false)[] = [
    { id: 'criticality', label: 'Criticality classified', done: Boolean(vendor.criticality) },
    { id: 'contract', label: 'Contract dates recorded', done: Boolean(vendor.contractStartDate) },
    {
      id: 'clauses',
      label: 'Security and confidentiality clauses confirmed',
      done: Boolean(vendor.securityClausesConfirmed && vendor.confidentialityClausesConfirmed),
    },
    { id: 'assurance', label: 'Current SOC 2 / ISO / AOC on file', done: assuranceValid },
    inPciScope && {
      id: 'acknowledgement',
      label: 'Written acknowledgement (12.8.2)',
      done: Boolean(vendor.tpspAcknowledgementDate),
    },
    inPciScope && {
      id: 'matrix',
      label: 'Responsibility matrix confirmed (12.8.5)',
      done: isMatrixComplete(vendor.responsibilityMatrix),
    },
    inPciScope && {
      id: 'pci-status',
      label: 'PCI DSS status checked in the last 12 months (12.8.4)',
      done: pciCheckedRecently,
    },
    {
      id: 'review',
      label: 'Periodic review not overdue',
      done: Boolean(vendor.nextReviewDue && daysUntil({ date: vendor.nextReviewDue, now }) >= 0),
    },
  ];
  return checks.filter((check): check is TpspCheck => check !== false);
}
