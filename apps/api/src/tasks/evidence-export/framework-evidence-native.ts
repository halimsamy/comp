import { Logger } from '@nestjs/common';
import { db } from '@db';
import { BUCKET_NAME, getObjectAsBuffer } from '../../app/s3';
import {
  parseExportSnapshot,
  renderSnapshot,
} from '../../isms/utils/export-payload';
import { SOAService } from '../../soa/soa.service';
import { safeSegment, type RequirementFolder } from './framework-evidence-plan';
import { SOA_REQUIREMENT_IDENTIFIER } from './native-artifact-control-map';
import { REGISTERS, type RegisterKey } from './registers/registers';

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
  /** Registers left out because the caller lacks read access. */
  omittedRegisters: RegisterKey[];
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
    select: { id: true, version: true, status: true },
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
    status: document.status,
    pdf: fileBuffer,
  };
}

export async function loadNativeArtifacts({
  organizationId,
  frameworkId,
  access,
}: {
  organizationId: string;
  frameworkId: string | null;
  access: NativeAccess;
}): Promise<NativeArtifacts> {
  const allowed = new Set(access.registers);
  const registers = new Map<RegisterKey, string>();
  for (const key of allowed) {
    registers.set(key, await REGISTERS[key].build({ organizationId }));
  }
  const omittedRegisters = (Object.keys(REGISTERS) as RegisterKey[]).filter(
    (key) => !allowed.has(key),
  );

  // ISMS documents and the SoA belong to platform frameworks only.
  if (!frameworkId) {
    return {
      isms: [],
      unpublishedIsms: [],
      soa: null,
      registers,
      omittedRegisters,
      soaOmitted: false,
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
    omittedRegisters,
    soaOmitted: hiddenSoas > 0,
  };
}

export type FolderNative = {
  isms: IsmsArtifact[];
  soa: boolean;
  registers: RegisterKey[];
};

/** ISMS documents (by clause or mapped control), the SoA (6.1.3) and registers for a folder. */
export function nativeForFolder({
  folder,
  natives,
}: {
  folder: RequirementFolder;
  natives: NativeArtifacts;
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
  ];
}
