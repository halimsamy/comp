import { Logger } from '@nestjs/common';
import { db } from '@db';
import { BUCKET_NAME, getObjectAsBuffer } from '../../app/s3';
import {
  parseExportSnapshot,
  renderSnapshot,
} from '../../isms/utils/export-payload';
import { SOAService } from '../../soa/soa.service';
import { soaStatus } from '../../soa/utils/export-generator';
import { safeSegment, type RequirementFolder } from './framework-evidence-plan';
import { frameworkFamily, SOA_REQUIREMENT_IDENTIFIER } from './native-artifact-control-map';
import type { AuditPeriod } from './framework-evidence-native-archive';
import { REGISTERS, type RegisterKey } from './registers/registers';
import { toCsv } from './registers/register-csv';
import { citingCsv, toCitedRows, type CitedRows } from './requirement-citations';
import {
  loadScanEvidence,
  scansForFolder,
  scanTitle,
  type FolderScan,
  type ScanEvidence,
} from './framework-evidence-scans';

const logger = new Logger('FrameworkEvidenceNative');

/** What the caller may see beyond the export's own permissions. */
export type NativeAccess = { registers: RegisterKey[]; soa: boolean };

export type IsmsArtifact = {
  title: string;
  fileName: string;
  version: number;
  requirementId: string | null;
  controlIds: Set<string>;
  pdf: Buffer;
};

export type NativeArtifacts = {
  isms: IsmsArtifact[];
  /** ISMS documents with no published version yet (named in the README only). */
  unpublishedIsms: string[];
  soa: { fileName: string; status: string; pdf: Buffer } | null;
  registers: Map<RegisterKey, string>;
  /** Registers whose rows cite requirements (findings, training), by row. */
  cited?: Map<RegisterKey, CitedRows>;
  /** Registers left out because the caller lacks read access. */
  omittedRegisters: RegisterKey[];
  /** Vulnerability scans with their reports (with read access to the vulnerabilities register). */
  scans?: ScanEvidence[];
  /** An SoA exists but the caller lacks audit read access. */
  soaOmitted: boolean;
};

/** Published ISMS PDF: the stored, approved file first, else re-rendered from its snapshot. */
async function loadIsmsPdf(version: {
  pdfUrl: string | null;
  contentSnapshot: Parameters<typeof parseExportSnapshot>[0];
}): Promise<Buffer | null> {
  if (version.pdfUrl && BUCKET_NAME) {
    try {
      return await getObjectAsBuffer(BUCKET_NAME, version.pdfUrl);
    } catch (error) {
      logger.warn(
        `Stored ISMS PDF ${version.pdfUrl} unavailable; re-rendering from snapshot: ${String(error)}`,
      );
    }
  }
  const snapshot = parseExportSnapshot(version.contentSnapshot);
  return snapshot ? (await renderSnapshot(snapshot, 'pdf')).fileBuffer : null;
}

async function loadIsmsArtifacts({
  organizationId,
  frameworkId,
}: {
  organizationId: string;
  frameworkId: string;
}): Promise<Pick<NativeArtifacts, 'isms' | 'unpublishedIsms'>> {
  const documents = await db.ismsDocument.findMany({
    where: { organizationId, frameworkId },
    select: {
      title: true,
      requirementId: true,
      controlLinks: { select: { controlId: true } },
      currentVersion: {
        select: { version: true, pdfUrl: true, contentSnapshot: true },
      },
    },
    orderBy: { type: 'asc' },
  });

  const isms: IsmsArtifact[] = [];
  const unpublishedIsms: string[] = [];
  for (const document of documents) {
    const version = document.currentVersion;
    const pdf = version ? await loadIsmsPdf(version) : null;
    if (!version || !pdf) {
      unpublishedIsms.push(document.title);
      continue;
    }
    isms.push({
      title: document.title,
      fileName: `${safeSegment(document.title)} v${version.version}.pdf`,
      version: version.version,
      requirementId: document.requirementId,
      controlIds: new Set(document.controlLinks.map((l) => l.controlId)),
      pdf,
    });
  }
  return { isms, unpublishedIsms };
}

async function loadSoa({
  organizationId,
  frameworkId,
}: {
  organizationId: string;
  frameworkId: string;
}): Promise<NativeArtifacts['soa']> {
  const document = await db.sOADocument.findFirst({
    where: { organizationId, frameworkId, isLatest: true },
    select: { id: true, version: true, status: true, approvedAt: true, declinedAt: true },
    orderBy: { version: 'desc' },
  });
  if (!document) return null;

  const { fileBuffer } = await new SOAService().exportDocument({
    documentId: document.id,
    organizationId,
    format: 'pdf',
  });
  return {
    fileName: `Statement of Applicability v${document.version}.pdf`,
    // approved / declined / needs_review / draft, as printed in the PDF header.
    status: soaStatus(document),
    pdf: fileBuffer,
  };
}

export async function loadNativeArtifacts({
  organizationId,
  frameworkId,
  frameworkName,
  access,
  period = {},
}: {
  organizationId: string;
  frameworkId: string | null;
  frameworkName?: string | null;
  access: NativeAccess;
  period?: AuditPeriod;
}): Promise<NativeArtifacts> {
  const allowed = new Set(access.registers);
  const registers = new Map<RegisterKey, string>();
  const cited = new Map<RegisterKey, CitedRows>();
  for (const key of allowed) {
    const { build, cited: loadCited } = REGISTERS[key];
    if (!loadCited) {
      registers.set(key, await build({ organizationId }));
      continue;
    }
    const table = await loadCited({ organizationId });
    registers.set(key, toCsv(table));
    cited.set(key, toCitedRows(table));
  }
  const omittedRegisters = (Object.keys(REGISTERS) as RegisterKey[]).filter(
    (key) => !allowed.has(key),
  );
  // Only ISO 27001 / PCI folders get a citation, so only they can place scans.
  const scans =
    allowed.has('vulnerabilities') && frameworkFamily(frameworkName)
      ? await loadScanEvidence({ organizationId, period })
      : [];

  // ISMS documents and the SoA belong to platform frameworks only.
  if (!frameworkId) {
    return {
      isms: [],
      unpublishedIsms: [],
      soa: null,
      registers,
      cited,
      omittedRegisters,
      soaOmitted: false,
      scans,
    };
  }
  const [ismsArtifacts, soa, hiddenSoas] = await Promise.all([
    loadIsmsArtifacts({ organizationId, frameworkId }),
    access.soa
      ? loadSoa({ organizationId, frameworkId })
      : Promise.resolve(null),
    access.soa
      ? Promise.resolve(0)
      : db.sOADocument.count({ where: { organizationId, frameworkId } }),
  ]);
  return {
    ...ismsArtifacts,
    soa,
    registers,
    cited,
    omittedRegisters,
    soaOmitted: hiddenSoas > 0,
    scans,
  };
}

/** A register's rows that cite the folder's requirement. */
export type CitedRegister = { key: RegisterKey; csv: string; count: number };

export type FolderNative = {
  isms: IsmsArtifact[];
  soa: boolean;
  registers: RegisterKey[];
  cited: CitedRegister[];
  /** Vulnerability scans evidencing the requirement (PCI 11.3.x, 11.4.x; ISO A.8.8). */
  scans?: FolderScan[];
};

function citedForFolder({
  folder,
  natives,
}: {
  folder: RequirementFolder;
  natives: NativeArtifacts;
}): CitedRegister[] {
  const key = folder.citation;
  if (!key || !natives.cited) return [];
  return [...natives.cited].flatMap(([register, rows]) => {
    const found = citingCsv({ cited: rows, key });
    return found ? [{ key: register, ...found }] : [];
  });
}

/** ISMS documents (by clause or mapped control), the SoA (6.1.3), registers and scans for a folder. */
export function nativeForFolder({
  folder,
  natives,
  documentFileKeys,
}: {
  folder: RequirementFolder;
  natives: NativeArtifacts;
  /** S3 keys of the folder's document submission files (a pentest report filed as a Penetration Test). */
  documentFileKeys?: Set<string>;
}): FolderNative {
  const controlIds = new Set(folder.controlIds);
  return {
    isms: natives.isms.filter(
      (doc) =>
        doc.requirementId === folder.requirement.id ||
        [...doc.controlIds].some((id) => controlIds.has(id)),
    ),
    soa:
      natives.soa !== null &&
      folder.requirement.identifier === SOA_REQUIREMENT_IDENTIFIER,
    registers: folder.registers.filter((key) => natives.registers.has(key)),
    cited: citedForFolder({ folder, natives }),
    scans: scansForFolder({ citation: folder.citation, scans: natives.scans ?? [], documentFileKeys }),
  };
}

/** Human-readable titles of a folder's native artifacts, for its README. */
export function folderNativeTitles(
  native: FolderNative,
  natives: NativeArtifacts,
): string[] {
  return [
    ...native.isms.map((doc) => `${doc.title} (published v${doc.version})`),
    ...(native.soa && natives.soa
      ? [natives.soa.fileName.replace(/\.pdf$/, '')]
      : []),
    ...native.registers.map((key) => REGISTERS[key].title),
    ...native.cited.map(
      (c) => `${REGISTERS[c.key].title} citing this requirement (${c.count})`,
    ),
    ...(native.scans ?? []).map((scan) => `Vulnerability scan: ${scanTitle(scan)}`),
  ];
}
