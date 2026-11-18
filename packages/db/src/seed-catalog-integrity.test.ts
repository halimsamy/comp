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

describe('ISO 27001 / PCI DSS catalog coverage', () => {
  const tasks = read<Array<Row & { name: string; description: string; frequency: string }>>(
    'primitives/FrameworkEditorTaskTemplate.json',
  );
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const controlTasks = read<Pair[]>('relations/_FrameworkEditorControlTemplateToFrameworkEditorTaskTemplate.json');
  const controlPolicies = read<Pair[]>(
    'relations/_FrameworkEditorControlTemplateToFrameworkEditorPolicyTemplate.json',
  );
  const scoped = requirements.filter((r) => r.frameworkId === ISO_27001 || r.frameworkId === PCI_DSS);
  const scopedIds = new Set(scoped.map((r) => r.id));
  const scopedControls = new Set(controlRequirements.filter((p) => scopedIds.has(p.B)).map((p) => p.A));
  const scopedTasks = [...new Set(controlTasks.filter((p) => scopedControls.has(p.A)).map((p) => p.B))].map(
    (id) => taskById.get(id),
  );
  const tasksOf = (controlId: string) => controlTasks.filter((p) => p.A === controlId).map((p) => p.B);
  const task = (name: string) => tasks.find((t) => t.name === name);

  it('gives every requirement a task or a policy through its controls', () => {
    const evidenced = new Set([...controlTasks, ...controlPolicies].map((p) => p.A));
    const bare = scoped
      .filter((r) => !controlRequirements.some((p) => p.B === r.id && evidenced.has(p.A)))
      .map((r) => r.identifier);

    expect(bare).toEqual([]);
  });

  it('keeps text for frameworks the program does not run out of its tasks', () => {
    const offFramework = /HIPAA|ISO 42001|CCPA|CPRA|PIPEDA|ePHI|AI MS|For GDPR/;

    expect(scopedTasks.filter((t) => !t || offFramework.test(t.description)).map((t) => t?.name)).toEqual([]);
  });

  it('cites Targeted Risk Analysis submissions instead of asking for TRA uploads', () => {
    const loose = /TRA reference|TRA-defined|set by your targeted risk analysis/i;

    expect(scopedTasks.filter((t) => t && loose.test(t.description)).map((t) => t?.name)).toEqual([]);
  });

  it('archives merged tasks and links their merge targets to the same controls', () => {
    const merged = [
      ['frk_tt_68406af04a4acb93083413b9', 'frk_tt_d04535046e66e84d10b92068', 'frk_ct_683f46f3f181af3f93773c1d'],
      ['frk_tt_68fa2a852e70f757188f0c39', 'frk_tt_9d21cfa9d3ba3a694587c610', 'frk_ct_684070f0b4f6c2036306e23c'],
      ['frk_tt_68406eedf0f0ddd220ea19c2', 'frk_tt_69f0d514d103c34ca40ad332', 'frk_ct_683f50aae46f5e4e096e6bb3'],
    ];
    const archived = ['frk_tt_69eb875fa49f13b4b81e9f3b', 'frk_tt_68e52b27c4bdbf1b24051b8b'];
    const stillScoped = new Set(controlTasks.filter((p) => scopedControls.has(p.A)).map((p) => p.B));

    expect([...merged.map(([from]) => from), ...archived].filter((id) => stillScoped.has(id))).toEqual([]);
    for (const [, into, control] of merged) expect(tasksOf(control)).toContain(into);
  });

  it('uses the reviewed frequencies', () => {
    const frequencies = enumValues({ file: 'shared.prisma', name: 'Frequency' });

    expect(tasks.filter((t) => !frequencies.has(t.frequency)).map((t) => t.name)).toEqual([]);
    expect(
      Object.fromEntries(
        [
          'Executive PCI accountability assignment',
          'Internal Security Audit',
          'Encryption at Rest',
          'TLS / HTTPS',
          'Legal Proof of Company Registration',
          'Building / Workplace Rules',
          'Secure Code',
          'Security incident register',
        ].map((name) => [name, task(name)?.frequency]),
      ),
    ).toEqual({
      'Executive PCI accountability assignment': 'yearly',
      'Internal Security Audit': 'yearly',
      'Encryption at Rest': 'yearly',
      'TLS / HTTPS': 'yearly',
      'Legal Proof of Company Registration': 'yearly',
      'Building / Workplace Rules': 'yearly',
      'Secure Code': 'quarterly',
      'Security incident register': 'quarterly',
    });
  });

  it('maps PCI 1.1.2 to Network Security and the inventory form to the PCI scope control', () => {
    const pci112 = scoped.find((r) => r.frameworkId === PCI_DSS && r.identifier === '1.1.2');
    const pciScope = controls.find((c) => c.id === 'frk_ct_69dd33a6d12ae294a95e9ac1');

    expect(controlRequirements).toContainEqual({ A: 'frk_ct_684070f0b4f6c2036306e23c', B: pci112?.id });
    expect(pciScope?.documentTypes).toContain('infrastructure_inventory');
  });

  it('keeps the ISO / PCI rules that the reworded tasks and trimmed policies no longer state', () => {
    const policies = read<Array<Row & { name: string; content: unknown }>>('primitives/FrameworkEditorPolicyTemplate.json');
    const policy = (name: string) => JSON.stringify(policies.find((p) => p.name === name)?.content ?? '');

    expect(policy('Access Control & Least Privilege')).toContain('no shared credentials'); // PCI 8.2.2
    expect(policy('Incident Response & Breach Notification')).toContain('payment brands'); // PCI 12.10.1
    expect(task('Corrective Action Reports')?.description).toContain('root cause'); // ISO 10.2
    expect(task('Supplier Evaluation Records')?.description).toContain('(12.8.4)');
    expect(task('Data Masking')?.description).toContain('BIN and last four'); // PCI 3.4.1
  });
});
