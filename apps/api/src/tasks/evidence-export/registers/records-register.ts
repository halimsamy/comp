import { db } from '@db';
import { listTrainingRecords } from '../../../training/training-records.service';
import { humanize, toCsv, type RegisterParams } from './register-csv';

/** Every training completion (ISO 27001 7.2, 7.3, A.6.3; PCI DSS 12.6.3.x). */
export async function buildTrainingRecordsCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const records = await listTrainingRecords(organizationId);
  return toCsv({
    headers: [
      'Name',
      'Email',
      'Training',
      'Completed',
      'Expires',
      'Source',
      'Certificate attached',
    ],
    rows: records.map((r) => [
      r.name,
      r.email,
      r.training,
      r.completedAt,
      r.expiresAt,
      humanize(r.source),
      r.hasAttachment,
    ]),
  });
}

const CHECKLIST_LABELS: Record<string, string> = {
  assuranceReviewed: 'Assurance reviewed',
  pciStatusConfirmed: 'PCI status confirmed',
  contractReviewed: 'Contract reviewed',
  riskReassessed: 'Risk reassessed',
};

/** Checked items of a review's checklist JSON, by label. */
function checkedItems(checklist: unknown): string {
  if (typeof checklist !== 'object' || checklist === null) return '';
  return Object.entries(checklist)
    .filter(([, done]) => done === true)
    .map(([key]) => CHECKLIST_LABELS[key] ?? key)
    .join('; ');
}

/** Signed-off periodic vendor reviews (ISO 27001 A.5.22; PCI DSS 12.8.4, 12.8.5). */
export async function buildVendorReviewsCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const reviews = await db.vendorReview.findMany({
    where: { organizationId },
    include: { vendor: { select: { name: true } } },
    orderBy: { reviewedAt: 'desc' },
  });
  const documentIds = [...new Set(reviews.flatMap((r) => r.reviewedDocumentIds))];
  const documents = documentIds.length
    ? await db.vendorDocument.findMany({
        where: { organizationId, id: { in: documentIds } },
        select: { id: true, name: true },
      })
    : [];
  const documentName = new Map(documents.map((d) => [d.id, d.name]));

  return toCsv({
    headers: [
      'Vendor',
      'Reviewed at',
      'Reviewed by',
      'Outcome',
      'Criticality',
      'PCI DSS status confirmed',
      'Checklist completed',
      'Documents reviewed',
      'Conditions',
      'Notes',
      'Next review due',
    ],
    rows: reviews.map((r) => [
      r.vendor.name,
      r.reviewedAt,
      r.reviewedByName,
      humanize(r.outcome),
      humanize(r.criticality),
      humanize(r.pciStatus),
      checkedItems(r.checklist),
      r.reviewedDocumentIds.map((id) => documentName.get(id) ?? id).join('; '),
      r.conditions.join('; '),
      r.notes,
      r.nextReviewDue,
    ]),
  });
}
