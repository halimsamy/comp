import type { Archiver } from 'archiver';
import { toCsvRow } from '../../evidence-forms/evidence-forms-csv';
import {
  APPLICABILITY_HEADERS,
  applicabilityColumns,
  type Applicability,
} from './framework-evidence-applicability';
import type {
  FolderNative,
  NativeArtifacts,
} from './framework-evidence-native';
import type { RequirementFolder } from './framework-evidence-plan';
import type { RootRecordCounts } from './framework-evidence-records';
import { REGISTERS, type RegisterKey } from './registers/registers';
import { appendFolderScans, SCANS_FOLDER } from './framework-evidence-scans';

export type AuditPeriod = { from?: Date; to?: Date };

/** Tracks where each native artifact landed, for native-artifacts.csv. */
export class NativeIndex {
  private readonly entries = new Map<
    string,
    { type: string; title: string; detail: string; paths: string[] }
  >();

  add({
    type,
    title,
    detail,
    path,
  }: {
    type: string;
    title: string;
    detail: string;
    path: string;
  }): void {
    const key = `${type}:${title}`;
    const entry = this.entries.get(key) ?? { type, title, detail, paths: [] };
    entry.paths.push(path);
    this.entries.set(key, entry);
  }

  toCsv(): string {
    return [
      toCsvRow(['type', 'artifact', 'detail', 'files']),
      ...[...this.entries.values()].map((e) =>
        toCsvRow([e.type, e.title, e.detail, e.paths.join(' | ')]),
      ),
    ].join('\n');
  }
}

/** Append a requirement folder's ISMS documents, SoA and register CSVs. */
export function appendFolderNative({
  archive,
  root,
  folder,
  native,
  natives,
  index,
}: {
  archive: Archiver;
  root: string;
  folder: string;
  native: FolderNative;
  natives: NativeArtifacts;
  index: NativeIndex;
}): void {
  const add = ({
    type,
    title,
    detail,
    path,
    source,
  }: {
    type: string;
    title: string;
    detail: string;
    path: string;
    source: Buffer | string;
  }) => {
    archive.append(source, { name: `${root}/${path}` });
    index.add({ type, title, detail, path });
  };

  for (const doc of native.isms) {
    add({
      type: 'ISMS document',
      title: doc.title,
      detail: `published v${doc.version}`,
      path: `${folder}/ISMS/${doc.fileName}`,
      source: doc.pdf,
    });
  }
  if (native.soa && natives.soa) {
    add({
      type: 'Statement of Applicability',
      title: 'Statement of Applicability',
      detail: natives.soa.status,
      path: `${folder}/ISMS/${natives.soa.fileName}`,
      source: natives.soa.pdf,
    });
  }
  for (const key of native.registers) {
    const csv = natives.registers.get(key);
    if (csv === undefined) continue;
    add({
      type: 'Register',
      title: REGISTERS[key].title,
      detail: 'snapshot at export time',
      path: `${folder}/Registers/${REGISTERS[key].fileName}`,
      source: csv,
    });
  }
  for (const { key, csv, count } of native.cited) {
    add({
      type: 'Register',
      title: `${REGISTERS[key].title} citing the requirement`,
      detail: `${count} row(s) per folder, snapshot at export time`,
      path: `${folder}/Registers/${citingFileName(key)}`,
      source: csv,
    });
  }
  appendFolderScans({ archive, root, folder, scans: native.scans ?? [], index });
}

/** `findings-citing-this-requirement.csv` */
export function citingFileName(key: RegisterKey): string {
  return REGISTERS[key].fileName.replace(/\.csv$/, '-citing-this-requirement.csv');
}

/** Root-level copies: every register, every published ISMS document and the SoA. */
export function appendRootNative({
  archive,
  root,
  natives,
  index,
}: {
  archive: Archiver;
  root: string;
  natives: NativeArtifacts;
  index: NativeIndex;
}): void {
  appendFolderNative({
    archive,
    root,
    folder: '_Platform records',
    native: {
      isms: natives.isms,
      soa: natives.soa !== null,
      registers: [...natives.registers.keys()],
      cited: [],
    },
    natives,
    index,
  });
}

/** One index.csv row: counts are policies, tasks, documents, ISMS documents, registers. */
export function indexRow({
  folder,
  applies,
  counts,
}: {
  folder: RequirementFolder;
  applies: Applicability;
  counts: [number, number, number, number, number];
}): string[] {
  return [
    folder.requirement.identifier,
    folder.requirement.name,
    folder.folder,
    String(folder.controlNames.length),
    Array.from(new Set((folder.controlOwners ?? []).filter(Boolean))).join(' | '),
    ...counts.map(String),
    ...applicabilityColumns(applies),
  ];
}

export function buildIndexCsv(rows: string[][]): string {
  return [
    toCsvRow([
      'requirement', 'name', 'folder', 'controls', 'control_owners', 'policies', 'tasks',
      'documents', 'isms_documents', 'registers', ...APPLICABILITY_HEADERS,
    ]),
    ...rows.map((row) => toCsvRow(row)),
  ].join('\n');
}

export function buildReadme({
  frameworkName,
  organizationName,
  natives,
  period,
  unapprovedPolicies = [],
  notApplicable = 0,
  auditTitle,
  records = { vendorDocuments: 0, riskReviews: 0 },
}: {
  frameworkName: string;
  organizationName: string;
  natives: NativeArtifacts;
  period: AuditPeriod;
  /** Mapped policies with no approved version (left out). */
  unapprovedPolicies?: string[];
  /** Requirements marked not applicable. */
  notApplicable?: number;
  auditTitle?: string;
  /** Only folders that were written are described. */
  records?: RootRecordCounts & { scanFolders?: number };
}): string {
  const day = (d?: Date) => (d ? d.toISOString().slice(0, 10) : '');
  const periodLine =
    period.from || period.to
      ? `Audit period: ${day(period.from) || 'start'} to ${day(period.to) || 'today'} (task attachments, automation runs, document submissions and vulnerability scans outside it are left out)`
      : 'Audit period: all time';
  const lines = [
    `${frameworkName} evidence export for ${organizationName}`,
    `Generated: ${new Date().toISOString()}`,
    periodLine,
    '',
    'One folder per requirement; index.csv lists them all.',
    'Each folder holds its policies (Policies/), tasks (Tasks/), document submissions',
    '(Documents/), published ISMS documents and the SoA (ISMS/) and platform registers',
    '(Registers/). "_Platform records/" holds one copy of every register and ISMS',
    'document; native-artifacts.csv lists where each one was placed.',
    'Rejected document submissions are never exported. Policies are exported at their',
    'last approved version, with a document-control header.',
    '',
    'Applicability: index.csv and "Applicability summary.csv" give each requirement\'s',
    'applicability, justification, who set it and when. A not-applicable folder holds',
    'only 00-requirement.txt and NOT_APPLICABLE.txt. Requirements met with compensating',
    'controls carry "CCW - <requirement>.pdf" (PCI DSS Appendix C).',
    `Requirements marked not applicable: ${notApplicable}.`,
  ];
  if (records.scanFolders) {
    lines.push(
      '',
      `"${SCANS_FOLDER}/" (PCI DSS 11.3.x, 11.4.x; ISO 27001 A.8.8) holds the scan records`,
      'and their attached reports; a report already filed as a document is not copied again.',
    );
  }
  if (records.vendorDocuments > 0) {
    lines.push('', 'Vendors/ holds each vendor\'s latest documents and AI report summaries.');
  }
  if (records.riskReviews > 0) {
    lines.push('', 'Risk reviews/ holds the risk register as frozen at each periodic review.');
  }
  if (auditTitle) {
    lines.push(
      '',
      `Audit: ${auditTitle}. audit-trail.csv lists each requirement's readiness, the`,
      'auditor\'s decision and comments; Requests/<id>/ holds each evidence request with',
      'the response and files.',
    );
  }
  if (unapprovedPolicies.length > 0) {
    lines.push('', 'Policies not approved (not included):');
    lines.push(...unapprovedPolicies.map((name) => `  - ${name}`));
  }
  if (natives.unpublishedIsms.length > 0) {
    lines.push('', 'ISMS documents not yet published (not included):');
    lines.push(...natives.unpublishedIsms.map((t) => `  - ${t}`));
  }
  if (natives.omittedRegisters.length > 0) {
    lines.push(
      '',
      'Registers left out (the exporting user lacks read access):',
    );
    lines.push(
      ...natives.omittedRegisters.map((k) => `  - ${REGISTERS[k].title}`),
    );
  }
  if (natives.soaOmitted) {
    lines.push(
      '',
      'Statement of Applicability left out (the exporting user lacks audit read access).',
    );
  }
  if (natives.soa && natives.soa.status !== 'approved') {
    lines.push(
      '',
      `Note: the Statement of Applicability is not approved yet (status: ${natives.soa.status}).`,
    );
  }
  return `${lines.join('\n')}\n`;
}
