import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SEED = path.join(__dirname, '../prisma/seed');
const SCHEMA = path.join(__dirname, '../prisma/schema');
const ISO_27001 = 'frk_681ecc34e85064efdbb76993';
const PCI_DSS = 'frk_69dcfb280b550e7ee231f312';

type Row = { id: string } & Record<string, unknown>;
type Pair = { A: string; B: string };

const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(SEED, file), 'utf-8'));
const ids = (file: string) => new Set(read<Row[]>(`primitives/${file}`).map((row) => row.id));

function enumValues({ file, name }: { file: string; name: string }): Set<string> {
  const schema = readFileSync(path.join(SCHEMA, file), 'utf-8');
  const body = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))?.[1] ?? '';
  return new Set(
    body
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((token) => token && !token.startsWith('//')),
  );
}

const requirements = read<Array<Row & { frameworkId: string; identifier: string }>>(
  'primitives/FrameworkEditorRequirement.json',
);
const controls = read<Array<Row & { documentTypes?: string[] }>>(
  'primitives/FrameworkEditorControlTemplate.json',
);
const controlIds = new Set(controls.map((c) => c.id));
const controlRequirements = read<Pair[]>(
  'relations/_FrameworkEditorControlTemplateToFrameworkEditorRequirement.json',
);

describe('seeded framework catalog', () => {
  it.each([
    ['_FrameworkEditorControlTemplateToFrameworkEditorRequirement.json', 'FrameworkEditorRequirement.json'],
    ['_FrameworkEditorControlTemplateToFrameworkEditorTaskTemplate.json', 'FrameworkEditorTaskTemplate.json'],
    ['_FrameworkEditorControlTemplateToFrameworkEditorPolicyTemplate.json', 'FrameworkEditorPolicyTemplate.json'],
  ])('%s only links existing, unique records', (relationFile, targetFile) => {
    const pairs = read<Pair[]>(`relations/${relationFile}`);
    const targets = ids(targetFile);

    expect(pairs.filter((p) => !controlIds.has(p.A) || !targets.has(p.B))).toEqual([]);
    expect(new Set(pairs.map((p) => `${p.A}:${p.B}`)).size).toBe(pairs.length);
  });

  it('uses only known evidence form types on controls', () => {
    const formTypes = enumValues({ file: 'shared.prisma', name: 'EvidenceFormType' });
    const unknown = controls.flatMap((c) => (c.documentTypes ?? []).filter((t) => !formTypes.has(t)));

    expect(unknown).toEqual([]);
  });

  it('links ISMS documents only to existing controls and known document types', () => {
    const documentTypes = enumValues({ file: 'isms.prisma', name: 'IsmsDocumentType' });
    const links = read<Array<{ frameworkId: string; controlTemplateId: string; documentType: string }>>(
      'isms-control-links.json',
    );

    expect(links.filter((l) => !controlIds.has(l.controlTemplateId))).toEqual([]);
    expect(links.filter((l) => !documentTypes.has(l.documentType))).toEqual([]);
    expect(links.every((l) => l.frameworkId === ISO_27001)).toBe(true);
  });

  it.each([
    ['ISO 27001', ISO_27001],
    ['PCI DSS', PCI_DSS],
  ])('maps every %s requirement to at least one control', (_name, frameworkId) => {
    const mapped = new Set(controlRequirements.map((p) => p.B));
    const unmapped = requirements
      .filter((r) => r.frameworkId === frameworkId && !mapped.has(r.id))
      .map((r) => r.identifier);

    expect(unmapped).toEqual([]);
  });

  it('uses the ISO 27001:2022 clause numbers', () => {
    const iso = requirements.filter((r) => r.frameworkId === ISO_27001).map((r) => r.identifier);

    expect(iso.filter((identifier) => identifier !== identifier.trim())).toEqual([]);
    expect(iso).toEqual(expect.arrayContaining(['6.2', '6.3', '9.1', '10.1', '10.2']));
    expect(iso).not.toContain('9.1.1');
    expect(iso).not.toContain('9.1.2');
  });
});
