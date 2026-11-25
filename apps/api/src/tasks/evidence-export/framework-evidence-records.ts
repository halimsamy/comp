import { db } from '@db';
import type { Archiver } from 'archiver';
import type { OffboardingExportService } from '../../offboarding-checklist/offboarding-export.service';
import { vendorDocumentSummarySchema } from '../../trigger/vendor/vendor-document-summary/summary-schema';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
} from './evidence-attachment-streamer';
import { appendAuditRequests, buildAuditTrailCsv } from './framework-evidence-audit';
import type { NativeArtifacts } from './framework-evidence-native';
import { safeSegment } from './framework-evidence-plan';
import { humanize } from './registers/register-csv';
import {
  RISK_REVIEW_SNAPSHOT_HEADERS,
  riskReviewSnapshotRows,
  snapshotOf,
} from './registers/risk-review-register';
import { renderRecordPdf } from './record-pdf';

type Framework = {
  frameworkName: string;
  organizationName: string;
  primaryColor: string | null;
};

/** Risk, inherent, residual, owner, acceptance, open actions. */
const PDF_COLUMNS = [1, 4, 5, 7, 8, 9];

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '-');

/**
 * Vendors/<name>/: the latest document of each type (SOC 2, ISO certificate,
 * AOC, DPA, ...) and the AI summary of each assurance report, for ISO 27001
 * A.5.19-A.5.22 and PCI DSS 12.8.
 */
export async function appendVendorFolders({
  archive,
  root,
  organizationId,
  framework,
}: {
  archive: Archiver;
  root: string;
  organizationId: string;
  framework: Framework;
}): Promise<number> {
  const documents = await db.vendorDocument.findMany({
    where: { organizationId, vendor: { archivedAt: null } },
    include: {
      vendor: { select: { name: true } },
      attachment: { select: { id: true, name: true, url: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    const key = `${doc.vendorId}:${doc.type}`;
    if (!latest.has(key)) latest.set(key, doc);
  }

  const trackers = new Map<string, (name: string) => string>();
  for (const doc of latest.values()) {
    const folderPath = `${root}/Vendors/${safeSegment(doc.vendor.name)}`;
    const uniqueName = trackers.get(folderPath) ?? createFilenameTracker();
    trackers.set(folderPath, uniqueName);
    await appendAttachmentToArchive({
      archive,
      attachment: doc.attachment,
      folderPath,
      uniqueName,
    });
    const summary = vendorDocumentSummarySchema.safeParse(doc.aiSummary);
    if (!summary.success) continue;
    const s = summary.data;
    archive.append(
      renderRecordPdf({
        title: `${doc.vendor.name}: ${s.reportType} summary`,
        documentCode: `VDOC-${doc.id}`,
        clause: 'A.5.22',
        frameworkName: framework.frameworkName,
        organizationName: framework.organizationName,
        primaryColor: framework.primaryColor,
        owner: null,
        issueDate: doc.updatedAt,
        nextReview: doc.expiresAt ? `Document expires ${day(doc.expiresAt)}` : 'Not set',
        sections: [
          {
            heading: 'Report',
            keyValues: [
              { label: 'Document', value: doc.name },
              { label: 'Type', value: s.reportType },
              { label: 'Auditor', value: s.auditor ?? '-' },
              { label: 'Period', value: `${s.periodStart ?? '-'} to ${s.periodEnd ?? '-'}` },
              { label: 'Opinion', value: humanize(s.opinion) },
              { label: 'Scope', value: s.scope },
            ],
          },
          { heading: 'Summary (AI generated)', paragraphs: [{ text: s.summary }] },
          {
            heading: 'Exceptions',
            emptyText: 'None reported.',
            table: s.exceptions.length
              ? {
                  headers: ['Control', 'Exception'],
                  rows: s.exceptions.map((e) => [e.control, e.description]),
                }
              : undefined,
          },
          {
            heading: 'Complementary user entity controls',
            emptyText: 'None listed.',
            bullets: s.complementaryUserEntityControls.length
              ? s.complementaryUserEntityControls
              : undefined,
          },
          {
            heading: 'Points to follow up',
            emptyText: 'None.',
            bullets: s.keyRisks.length ? s.keyRisks : undefined,
          },
        ],
      }),
      { name: `${folderPath}/${uniqueName(`AI summary - ${safeSegment(doc.name)}.pdf`)}` },
    );
  }
  return latest.size;
}

/** Risk reviews/: the register as frozen at each periodic review (ISO 27001 8.2). */
export async function appendRiskReviewPdfs({
  archive,
  root,
  organizationId,
  framework,
}: {
  archive: Archiver;
  root: string;
  organizationId: string;
  framework: Framework;
}): Promise<number> {
  const reviews = await db.riskReview.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
  const uniqueName = createFilenameTracker();
  for (const review of reviews) {
    const { totals, acceptanceRequiredFromLevel } = snapshotOf(review.snapshot);
    const pdf = renderRecordPdf({
      title: `Risk review of ${day(review.createdAt)}`,
      documentCode: `RR-${review.id}`,
      clause: '8.2',
      frameworkName: framework.frameworkName,
      organizationName: framework.organizationName,
      primaryColor: framework.primaryColor,
      owner: review.reviewedByName,
      approverName: review.reviewedByName,
      approvedAt: review.createdAt,
      issueDate: review.createdAt,
      nextReview: day(review.nextReviewDue),
      sections: [
        {
          heading: 'Review',
          keyValues: [
            { label: 'Reason', value: humanize(review.trigger) },
            { label: 'Risks reviewed', value: String(totals.risks ?? 0) },
            { label: 'Acceptance required from', value: humanize(acceptanceRequiredFromLevel) },
            { label: 'Awaiting acceptance', value: String(totals.awaitingAcceptance ?? 0) },
            { label: 'Open / overdue actions', value: `${totals.openActions ?? 0} / ${totals.overdueActions ?? 0}` },
            { label: 'Notes', value: review.notes || '-' },
          ],
        },
        {
          heading: 'Register at sign-off',
          emptyText: 'No risks in the register.',
          // The UI dialog's columns; the CSV keeps every field.
          table: {
            headers: PDF_COLUMNS.map((i) => RISK_REVIEW_SNAPSHOT_HEADERS[i]),
            rows: riskReviewSnapshotRows(review.snapshot).map((row) => PDF_COLUMNS.map((i) => row[i])),
          },
        },
      ],
    });
    archive.append(pdf, {
      name: `${root}/Risk reviews/${uniqueName(`Risk review ${day(review.createdAt)}.pdf`)}`,
    });
  }
  return reviews.length;
}

/** What appendRootRecords wrote: Vendors/ and Risk reviews/ exist only when non-zero. */
export type RootRecordCounts = { vendorDocuments: number; riskReviews: number };

/**
 * Root-level records: offboarding evidence, vendor documents and risk review
 * PDFs (each only with read access to its register), and for an audit
 * export the audit trail and the evidence requests.
 */
export async function appendRootRecords({
  archive,
  root,
  organizationId,
  framework,
  natives,
  offboardingExport,
  auditId,
  requirementLabels,
}: {
  archive: Archiver;
  root: string;
  organizationId: string;
  framework: Framework;
  natives: Pick<NativeArtifacts, 'registers'>;
  offboardingExport?: OffboardingExportService;
  auditId?: string;
  requirementLabels: Map<string, string>;
}): Promise<RootRecordCounts> {
  if (offboardingExport && natives.registers.has('offboarding')) {
    await offboardingExport.appendAllOffboardings({
      archive,
      organizationId,
      prefix: `${root}/_Platform records/Offboarding evidence/`,
    });
  }
  const counts = {
    vendorDocuments: natives.registers.has('vendors')
      ? await appendVendorFolders({ archive, root, organizationId, framework })
      : 0,
    riskReviews: natives.registers.has('risk-reviews')
      ? await appendRiskReviewPdfs({ archive, root, organizationId, framework })
      : 0,
  };
  if (!auditId) return counts;
  archive.append(await buildAuditTrailCsv({ organizationId, auditId }), {
    name: `${root}/audit-trail.csv`,
  });
  await appendAuditRequests({ archive, root, organizationId, auditId, requirementLabels });
  return counts;
}
