import { Logger } from '@nestjs/common';
import { db, type VulnerabilityScanKind } from '@db';
import type { Archiver } from 'archiver';
import { BUCKET_NAME, getObjectAsBuffer } from '../../app/s3';
import { createFilenameTracker } from './evidence-attachment-streamer';
import type { AuditPeriod, NativeIndex } from './framework-evidence-native-archive';
import { toCsv } from './registers/register-csv';

const logger = new Logger('FrameworkEvidenceScans');

/** A Vulnerabilities > Scans record with its attached report (ASV attestation, pentest report). */
export type ScanEvidence = {
  id: string;
  kind: VulnerabilityScanKind;
  vendor: string | null;
  scannedAt: Date;
  passed: boolean | null;
  findingCount: number;
  /** null: no report attached, or the stored file is missing. */
  report: { name: string; key: string; pdf: Buffer } | null;
};

/** A scan placed in a requirement folder; `reportInDocuments` = its report is already there as a document submission file. */
export type FolderScan = ScanEvidence & { reportInDocuments: boolean };

const KIND_LABEL: Record<VulnerabilityScanKind, string> = {
  external_asv: 'ASV scan',
  internal: 'Internal scan',
  pentest: 'Penetration test',
};

export const SCANS_FOLDER = 'Vulnerability scans';

/**
 * Every scan with its report bytes. shortcut: reports are held in memory for the
 * whole export (a handful per org); stream per folder if orgs keep many scans.
 */
export async function loadScanEvidence({
  organizationId,
  period = {},
}: {
  organizationId: string;
  /** Same audit-period filter as task uploads and document submissions. */
  period?: AuditPeriod;
}): Promise<ScanEvidence[]> {
  const scans = await db.vulnerabilityScan.findMany({
    where: {
      organizationId,
      ...(period.from || period.to ? { scannedAt: { gte: period.from, lte: period.to } } : {}),
    },
    orderBy: { scannedAt: 'desc' },
  });
  const ids = scans.flatMap((s) => (s.attachmentId ? [s.attachmentId] : []));
  const attachments = ids.length
    ? await db.attachment.findMany({
        where: { organizationId, entityType: 'vulnerability_scan', id: { in: ids } },
        select: { id: true, name: true, url: true },
      })
    : [];
  const byId = new Map(attachments.map((a) => [a.id, a]));

  const result: ScanEvidence[] = [];
  for (const scan of scans) {
    const file = scan.attachmentId ? byId.get(scan.attachmentId) : undefined;
    result.push({
      id: scan.id,
      kind: scan.kind,
      vendor: scan.vendor,
      scannedAt: scan.scannedAt,
      passed: scan.passed,
      findingCount: scan.findingCount,
      report: file ? await loadReport({ organizationId, file }) : null,
    });
  }
  return result;
}

async function loadReport({
  organizationId,
  file,
}: {
  organizationId: string;
  file: { id: string; name: string; url: string };
}): Promise<ScanEvidence['report']> {
  // Never export a key outside this org's namespace.
  if (!BUCKET_NAME || !file.url.startsWith(`${organizationId}/`)) return null;
  try {
    return { name: file.name, key: file.url, pdf: await getObjectAsBuffer(BUCKET_NAME, file.url) };
  } catch (error) {
    logger.warn(`Scan report ${file.id} unavailable: ${String(error)}`);
    return null;
  }
}

/** Scan kinds that evidence a requirement, by its citation key (`pci:11.3.2`). */
export function scanKindsFor(citation: string | null | undefined): VulnerabilityScanKind[] {
  if (!citation) return [];
  const [family, id] = citation.split(':');
  if (family === 'iso27001') return id === 'A.8.8' ? ['external_asv', 'internal', 'pentest'] : [];
  if (family !== 'pci') return [];
  const under = (parent: string) => id === parent || id.startsWith(`${parent}.`);
  if (under('11.3.1')) return ['internal'];
  if (under('11.3.2')) return ['external_asv'];
  return under('11.4') ? ['pentest'] : [];
}

/** The folder's scans; a report already exported with a document submission is not copied again. */
export function scansForFolder({
  citation,
  scans,
  documentFileKeys = new Set(),
}: {
  citation: string | null | undefined;
  scans: ScanEvidence[];
  documentFileKeys?: Set<string>;
}): FolderScan[] {
  const kinds = scanKindsFor(citation);
  return scans
    .filter((s) => kinds.includes(s.kind))
    .map((s) => ({ ...s, reportInDocuments: !!s.report && documentFileKeys.has(s.report.key) }));
}

export function scanTitle(scan: ScanEvidence): string {
  const result = scan.passed === null ? '' : scan.passed ? ', passed' : ', failed';
  return `${KIND_LABEL[scan.kind]} ${scan.scannedAt.toISOString().slice(0, 10)}${scan.vendor ? ` by ${scan.vendor}` : ''}${result}`;
}

/** `<folder>/Vulnerability scans/`: scans.csv plus each report not already in Documents/. */
export function appendFolderScans({
  archive,
  root,
  folder,
  scans,
  index,
}: {
  archive: Archiver;
  root: string;
  folder: string;
  scans: FolderScan[];
  index: NativeIndex;
}): void {
  if (scans.length === 0) return;
  const base = `${folder}/${SCANS_FOLDER}`;
  const uniqueName = createFilenameTracker();
  const rows = scans.map((scan) => {
    let report = 'No report attached';
    if (scan.reportInDocuments) report = 'In Documents/ (document submission file)';
    else if (scan.report) {
      const path = `${base}/${uniqueName(scan.report.name)}`;
      archive.append(scan.report.pdf, { name: `${root}/${path}` });
      index.add({ type: 'Vulnerability scan', title: scanTitle(scan), detail: 'attached report', path });
      report = path.slice(base.length + 1);
    }
    return [
      scan.id,
      KIND_LABEL[scan.kind],
      scan.vendor,
      scan.scannedAt,
      scan.passed === null ? 'No verdict' : scan.passed ? 'Passed' : 'Failed',
      scan.findingCount,
      report,
    ];
  });
  archive.append(
    toCsv({
      headers: ['Scan ID', 'Kind', 'Vendor', 'Scanned', 'Result', 'Findings', 'Report'],
      rows,
    }),
    { name: `${root}/${base}/scans.csv` },
  );
  index.add({
    type: 'Vulnerability scans',
    title: 'Scan list per requirement',
    detail: 'scans.csv, one row per scan',
    path: `${base}/scans.csv`,
  });
}
