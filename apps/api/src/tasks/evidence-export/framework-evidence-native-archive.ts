import type { Archiver } from 'archiver';
import { toCsvRow } from '../../evidence-forms/evidence-forms-csv';
import type {
  FolderNative,
  NativeArtifacts,
} from './framework-evidence-native';
import { REGISTERS } from './registers/registers';

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
    },
    natives,
    index,
  });
}

export function buildReadme({
  frameworkName,
  organizationName,
  natives,
  period,
}: {
  frameworkName: string;
  organizationName: string;
  natives: NativeArtifacts;
  period: AuditPeriod;
}): string {
  const day = (d?: Date) => (d ? d.toISOString().slice(0, 10) : '');
  const periodLine =
    period.from || period.to
      ? `Audit period: ${day(period.from) || 'start'} to ${day(period.to) || 'today'} (task attachments, automation runs and document submissions outside it are left out)`
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
    'Rejected document submissions are never exported.',
  ];
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
  if (natives.soa && natives.soa.status !== 'completed') {
    lines.push(
      '',
      `Note: the Statement of Applicability is not approved yet (status: ${natives.soa.status}).`,
    );
  }
  return `${lines.join('\n')}\n`;
}
