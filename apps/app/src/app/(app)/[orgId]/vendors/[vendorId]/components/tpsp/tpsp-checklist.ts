import type { VendorTpspFields } from '@/hooks/use-vendors';
import { daysUntil } from '../../../lib/vendor-tpsp';

export interface TpspCheck {
  id: string;
  label: string;
  done: boolean;
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
  const pciCheckedRecently = Boolean(
    vendor.pciStatusCheckedAt && daysUntil({ date: vendor.pciStatusCheckedAt, now }) > -365,
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
      label: 'Responsibility matrix (12.8.5)',
      done: (vendor.responsibilityMatrix?.length ?? 0) > 0,
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
