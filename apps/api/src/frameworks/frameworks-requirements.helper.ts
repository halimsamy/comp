import { db } from '@db';
import type { FrameworkManifest } from './framework-versioning/manifest.types';

export type RequirementDef = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  requirementFamily?: string | null;
  sortOrder?: number | null;
  frameworkId: string | null;
  customFrameworkId: string | null;
  kind: 'platform' | 'custom';
};

// FRAME-18: numbered requirements first (ascending), unset rows (incl. per-instance
// custom requirements) last, then by identifier (the canonical-order key, e.g.
// CC6.1 / GV.OC-01) with name as a final tiebreak. Mirrors the app-side
// `compareRequirementsByOrder` so server and client agree on the order.
function compareRequirementDefs(a: RequirementDef, b: RequirementDef): number {
  const ao = a.sortOrder ?? null;
  const bo = b.sortOrder ?? null;
  if (ao !== bo) {
    if (ao === null) return 1;
    if (bo === null) return -1;
    return ao - bo;
  }
  const byIdentifier = (a.identifier ?? '').localeCompare(b.identifier ?? '', undefined, {
    numeric: true,
  });
  if (byIdentifier !== 0) return byIdentifier;
  return a.name.localeCompare(b.name);
}

export async function loadRequirementDefinitions(fi: {
  id?: string;
  frameworkId: string | null;
  customFrameworkId: string | null;
  currentVersionId?: string | null;
}): Promise<RequirementDef[]> {
  if (fi.customFrameworkId) {
    const rows = await db.customRequirement.findMany({
      where: { customFrameworkId: fi.customFrameworkId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      identifier: r.identifier,
      description: r.description,
      frameworkId: null,
      customFrameworkId: r.customFrameworkId,
      kind: 'custom',
    }));
  }
  if (fi.frameworkId) {
    // Per-instance custom requirements (org tacked an extra requirement
    // onto a platform framework). Always merged in alongside the platform
    // requirements, regardless of whether we read from the pinned version
    // manifest or the editor table fallback.
    const customRows = fi.id
      ? await db.customRequirement.findMany({
          where: { frameworkInstanceId: fi.id },
          orderBy: { name: 'asc' },
        })
      : [];
    const customDefs: RequirementDef[] = customRows.map((r) => ({
      id: r.id,
      name: r.name,
      identifier: r.identifier,
      description: r.description,
      frameworkId: null,
      customFrameworkId: null,
      kind: 'custom',
    }));

    // Prefer the pinned version's manifest so customers see exactly what
    // they're synced to — NOT the live template state which may have
    // additions not yet synced.
    if (fi.currentVersionId) {
      const version = await db.frameworkVersion.findUnique({
        where: { id: fi.currentVersionId },
        select: { manifest: true },
      });
      if (version) {
        const manifest = version.manifest as unknown as FrameworkManifest;
        const platformDefs: RequirementDef[] = [...manifest.requirements].map(
          (r) => ({
            id: r.id,
            name: r.name,
            identifier: r.identifier,
            description: r.description ?? '',
            requirementFamily: r.requirementFamily ?? null,
            sortOrder: r.sortOrder ?? null,
            frameworkId: fi.frameworkId,
            customFrameworkId: null,
            kind: 'platform',
          }),
        );
        return [...platformDefs, ...customDefs].sort(compareRequirementDefs);
      }
    }
    // Fallback: instances with no pinned version (shouldn't happen post-backfill).
    const rows = await db.frameworkEditorRequirement.findMany({
      where: { frameworkId: fi.frameworkId },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { identifier: 'asc' },
        { name: 'asc' },
      ],
    });
    const platformDefs: RequirementDef[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      identifier: r.identifier,
      description: r.description,
      requirementFamily: r.requirementFamily ?? null,
      sortOrder: r.sortOrder ?? null,
      frameworkId: r.frameworkId,
      customFrameworkId: null,
      kind: 'platform',
    }));
    return [...platformDefs, ...customDefs].sort(compareRequirementDefs);
  }
  return [];
}
