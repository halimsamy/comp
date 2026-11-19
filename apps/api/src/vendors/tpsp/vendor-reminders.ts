import type {
  TaskItemPriority,
  VendorCriticality,
  VendorDocumentType,
} from '@db';
import {
  type AttentionVendor,
  isExpiringSoon,
  isVendorInReviewScope,
  latestDocumentsByType,
  reviewStatus,
} from './vendor-review-status';

export const VENDOR_REVIEW_TASK_TITLE = 'Complete periodic vendor review';
export const CONTRACT_RENEWAL_TASK_TITLE = 'Renew or exit the vendor contract';
export const ARCHIVE_OR_RENEW_TASK_TITLE = 'Archive or renew this vendor';

export const DOCUMENT_TYPE_LABEL: Record<VendorDocumentType, string> = {
  soc2_type1: 'SOC 2 Type I report',
  soc2_type2: 'SOC 2 Type II report',
  iso27001_certificate: 'ISO 27001 certificate',
  pci_aoc: 'PCI DSS AOC',
  dpa: 'DPA',
  contract: 'contract',
  nda: 'NDA',
  pentest_report: 'penetration test report',
  insurance: 'insurance certificate',
  questionnaire: 'security questionnaire',
  other: 'document',
};

export const documentRenewalTitle = (type: VendorDocumentType) =>
  `Request an updated ${DOCUMENT_TYPE_LABEL[type]}`;

export type ReminderVendor = Omit<AttentionVendor, 'status' | 'documents'> & {
  id: string;
  criticality: VendorCriticality | null;
  contractEndDate: Date | null;
  documents: {
    type: VendorDocumentType;
    name: string;
    expiresAt: Date | null;
  }[];
};

export type PlannedReminder = {
  vendorId: string;
  title: string;
  description: string;
  priority: TaskItemPriority;
};

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Reminder task items to create for a vendor. `existingTitles` are the
 * vendor's open (or recently created) task titles, so reminders never duplicate.
 */
export function planVendorReminders({
  vendor,
  existingTitles,
  now = new Date(),
}: {
  vendor: ReminderVendor;
  existingTitles: Set<string>;
  now?: Date;
}): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  if (vendor.archivedAt) return planned;
  const add = (reminder: Omit<PlannedReminder, 'vendorId'>) => {
    if (existingTitles.has(reminder.title)) return;
    planned.push({ vendorId: vendor.id, ...reminder });
  };

  const status = reviewStatus({ ...vendor, now });
  // PCI DSS 12.8.4 TPSPs, critical/high vendors and unclassified high-inherent vendors.
  const mustReview = isVendorInReviewScope(vendor);
  if (
    status === 'overdue' ||
    status === 'due_soon' ||
    (status === 'never_reviewed' && mustReview)
  ) {
    add({
      title: VENDOR_REVIEW_TASK_TITLE,
      description: vendor.nextReviewDue
        ? `The periodic review is due on ${day(vendor.nextReviewDue)}. Review the latest assurance report, PCI DSS status and contract, then sign off on the Security review tab.`
        : `This vendor has never been reviewed.${vendor.criticality ? '' : ' Set its criticality first.'} Review its assurance report, PCI DSS status and contract, then sign off on the Security review tab.`,
      priority:
        status === 'overdue' || status === 'never_reviewed' ? 'high' : 'medium',
    });
  }

  for (const doc of latestDocumentsByType(vendor.documents)) {
    if (!doc.expiresAt || !isExpiringSoon({ expiresAt: doc.expiresAt, now }))
      continue;
    const expired = doc.expiresAt < now;
    add({
      title: documentRenewalTitle(doc.type),
      description: `"${doc.name}" ${expired ? 'expired' : 'expires'} on ${day(doc.expiresAt)}. Ask the vendor for the current version and upload it on the Security review tab.`,
      priority: expired ? 'high' : 'medium',
    });
  }

  const contractEnd = vendor.contractEndDate;
  if (contractEnd && contractEnd < now) {
    add({
      title: ARCHIVE_OR_RENEW_TASK_TITLE,
      description: `The contract ended on ${day(contractEnd)}. If the relationship is over, archive the vendor (Actions menu) after access is revoked and data is returned or deleted; otherwise record the renewed contract dates.`,
      priority: 'medium',
    });
  } else if (contractEnd && isExpiringSoon({ expiresAt: contractEnd, now })) {
    add({
      title: CONTRACT_RENEWAL_TASK_TITLE,
      description: `The contract ends on ${day(contractEnd)}. Renew it with the required security and confidentiality clauses, or plan the exit.`,
      priority: 'medium',
    });
  }
  return planned;
}
