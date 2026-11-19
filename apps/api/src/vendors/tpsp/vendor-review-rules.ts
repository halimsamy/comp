import type { VendorReviewOutcome, VendorPciStatus } from '@db';

export const VERIFY_RISK_ASSESSMENT_TASK_TITLE = 'Verify risk assessment';

export interface ReviewSignOffInput {
  outcome: VendorReviewOutcome;
  checklist: {
    assuranceReviewed: boolean;
    pciStatusConfirmed: boolean;
    contractReviewed: boolean;
    riskReassessed: boolean;
  };
  pciStatus?: VendorPciStatus;
  conditions?: string[];
}

/**
 * Why a sign-off is invalid (null = valid). "Approved" needs every check (the
 * PCI one only for vendors in PCI DSS 12.8 scope); "approved with conditions"
 * needs at least one condition; a confirmed PCI status must be a real status.
 */
export function reviewSignOffError({
  input,
  inPciScope,
}: {
  input: ReviewSignOffInput;
  inPciScope: boolean;
}): string | null {
  const { checklist } = input;
  if (checklist.pciStatusConfirmed && !input.pciStatus) {
    return 'Choose the PCI DSS status you confirmed';
  }
  if (checklist.pciStatusConfirmed && input.pciStatus === 'unknown') {
    return 'A confirmed PCI DSS status cannot be "unknown"';
  }
  if (input.outcome === 'approved') {
    const missing =
      !checklist.assuranceReviewed ||
      !checklist.contractReviewed ||
      !checklist.riskReassessed ||
      (inPciScope && !checklist.pciStatusConfirmed);
    if (missing) {
      return 'Approval needs every check. Use "Approved with conditions" for anything still open.';
    }
  }
  const conditions = (input.conditions ?? []).filter((c) => c.trim());
  if (input.outcome === 'approved_with_conditions' && conditions.length === 0) {
    return 'Add at least one condition';
  }
  return null;
}
