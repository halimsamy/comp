import type {
  TaskItemPriority,
  VendorCriticality,
  VendorDocumentType,
} from '@db';
import { isExpiringSoon, reviewStatus } from './vendor-review-status';

export const VENDOR_REVIEW_TASK_TITLE = 'Complete periodic vendor review';
export const CONTRACT_RENEWAL_TASK_TITLE = 'Renew or exit the vendor contract';

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

export type ReminderVendor = {
  id: string;
  criticality: VendorCriticality | null;
  handlesCardholderData: boolean;
  affectsCdeSecurity: boolean;
  lastReviewedAt: Date | null;
  nextReviewDue: Date | null;
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

/** Only the latest-expiring document of each type matters; older ones are superseded. */
function latestByType(documents: ReminderVendor['documents']) {
  const latest = new Map<
    VendorDocumentType,
    ReminderVendor['documents'][number]
  >();
  for (const doc of documents) {
    if (!doc.expiresAt) continue;
    const current = latest.get(doc.type);
    if (!current?.expiresAt || current.expiresAt < doc.expiresAt)
      latest.set(doc.type, doc);
  }
  return [...latest.values()];
}

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
  const add = (reminder: Omit<PlannedReminder, 'vendorId'>) => {
    if (existingTitles.has(reminder.title)) return;
    planned.push({ vendorId: vendor.id, ...reminder });
  };

  const status = reviewStatus({ ...vendor, now });
  // PCI DSS 12.8.4 covers TPSPs that share account data or can affect its security.
  const mustReview =
    vendor.handlesCardholderData ||
    vendor.affectsCdeSecurity ||
    vendor.criticality === 'critical' ||
    vendor.criticality === 'high';
  if (
    status === 'overdue' ||
    status === 'due_soon' ||
    (status === 'never_reviewed' && mustReview)
  ) {
    add({
      title: VENDOR_REVIEW_TASK_TITLE,
      description: vendor.nextReviewDue
        ? `The periodic review is due on ${day(vendor.nextReviewDue)}. Review the latest assurance report, PCI DSS status and contract, then sign off on the Reviews tab.`
        : 'This vendor has never been reviewed. Review its assurance report, PCI DSS status and contract, then sign off on the Reviews tab.',
      priority:
        status === 'overdue' || status === 'never_reviewed' ? 'high' : 'medium',
    });
  }

  for (const doc of latestByType(vendor.documents)) {
    if (!doc.expiresAt || !isExpiringSoon({ expiresAt: doc.expiresAt, now }))
      continue;
    const expired = doc.expiresAt < now;
    add({
      title: documentRenewalTitle(doc.type),
      description: `"${doc.name}" ${expired ? 'expired' : 'expires'} on ${day(doc.expiresAt)}. Ask the vendor for the current version and upload it on the Documents tab.`,
      priority: expired ? 'high' : 'medium',
    });
  }

  const contractEnd = vendor.contractEndDate;
  const endedLongAgo =
    contractEnd && now.getTime() - contractEnd.getTime() > 30 * 86_400_000;
  if (
    contractEnd &&
    !endedLongAgo &&
    isExpiringSoon({ expiresAt: contractEnd, now })
  ) {
    add({
      title: CONTRACT_RENEWAL_TASK_TITLE,
      description: `The contract ends on ${day(contractEnd)}. Renew it with the required security and confidentiality clauses, or plan the exit.`,
      priority: 'medium',
    });
  }
  return planned;
}
