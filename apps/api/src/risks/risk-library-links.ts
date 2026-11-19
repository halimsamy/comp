import { db } from '@db';

type ParsedRef = { framework: 'pci' | 'iso'; identifier: string };

/** "PCI DSS 6.4.3" → pci/6.4.3, "ISO A.8.28" → iso/A.8.28, anything else → null. */
export function parseFrameworkRef(ref: string): ParsedRef | null {
  const pci = /^PCI DSS\s+(\S+)$/i.exec(ref.trim());
  if (pci) return { framework: 'pci', identifier: pci[1] };
  const iso = /^ISO(?:\s+27001)?\s+(\S+)$/i.exec(ref.trim());
  if (iso) return { framework: 'iso', identifier: iso[1].toUpperCase() };
  return null;
}

const FRAMEWORK_NAME: Record<ParsedRef['framework'], string> = {
  pci: 'PCI',
  iso: '27001',
};

export type RefLinks = Map<string, { controlIds: string[]; taskIds: string[] }>;

/**
 * Resolves library references to the org's controls (through the
 * requirement → control map of its framework instances) and their evidence
 * tasks. Refs the org has no framework for resolve to nothing.
 */
export async function resolveFrameworkRefs({
  organizationId,
  refs,
}: {
  organizationId: string;
  refs: string[];
}): Promise<RefLinks> {
  const parsed = [...new Set(refs)]
    .map((ref) => ({ ref, parsed: parseFrameworkRef(ref) }))
    .filter(
      (entry): entry is { ref: string; parsed: ParsedRef } =>
        entry.parsed !== null,
    );
  const links: RefLinks = new Map();
  if (parsed.length === 0) return links;

  const maps = await db.requirementMap.findMany({
    where: {
      archivedAt: null,
      frameworkInstance: { organizationId },
      OR: parsed.map(({ parsed: p }) => ({
        requirement: {
          identifier: p.identifier,
          framework: {
            name: {
              contains: FRAMEWORK_NAME[p.framework],
              mode: 'insensitive',
            },
          },
        },
      })),
    },
    select: {
      controlId: true,
      requirement: {
        select: { identifier: true, framework: { select: { name: true } } },
      },
      control: { select: { tasks: { select: { id: true } } } },
    },
  });

  for (const { ref, parsed: p } of parsed) {
    const matches = maps.filter(
      (m) =>
        m.requirement?.identifier === p.identifier &&
        m.requirement.framework.name
          .toLowerCase()
          .includes(FRAMEWORK_NAME[p.framework].toLowerCase()),
    );
    links.set(ref, {
      controlIds: [...new Set(matches.map((m) => m.controlId))],
      taskIds: [
        ...new Set(matches.flatMap((m) => m.control.tasks.map((t) => t.id))),
      ],
    });
  }
  return links;
}

/** Union of the controls and tasks behind a set of refs. */
export function linksFor({ links, refs }: { links: RefLinks; refs: string[] }) {
  const controlIds = new Set<string>();
  const taskIds = new Set<string>();
  for (const ref of refs) {
    const entry = links.get(ref);
    entry?.controlIds.forEach((id) => controlIds.add(id));
    entry?.taskIds.forEach((id) => taskIds.add(id));
  }
  return { controlIds: [...controlIds], taskIds: [...taskIds] };
}
