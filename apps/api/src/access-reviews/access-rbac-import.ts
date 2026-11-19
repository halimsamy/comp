import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { z } from 'zod';

const MatrixRow = z.object({
  system: z.string().catch(''),
  roleName: z.string().catch(''),
  permissionsScope: z.string().optional().catch(undefined),
  approvedBy: z.string().optional().catch(undefined),
  lastReviewed: z.string().optional().catch(undefined),
});
const MatrixData = z.object({ matrixRows: z.array(MatrixRow).catch([]) }).catch({ matrixRows: [] });

const PRIVILEGED = /\b(admin|administrator|owner|root|break-glass|superuser)\b/i;

/** "AWS production account (service account)" and "AWS Production Account" are one system. */
export function systemGroupKey(system: string): string {
  return system.split('(')[0].trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface RbacImportGroup {
  /** System name to create or reuse. */
  name: string;
  /** Original system strings from the form that fold into this system. */
  sources: string[];
}

async function loadRows(organizationId: string) {
  const submissions = await db.evidenceSubmission.findMany({
    where: { organizationId, formType: 'rbac_matrix' },
    select: { data: true },
    orderBy: { submittedAt: 'desc' },
    // The matrix is resubmitted whole, so the latest submission is the current one.
    take: 1,
  });
  return submissions
    .flatMap((s) => MatrixData.parse(s.data).matrixRows)
    .filter((r) => r.system.trim() && r.roleName.trim());
}

/** Step 1: the proposed systems, merging names that differ only in case or a "(...)" suffix. */
export async function previewRbacImport(organizationId: string) {
  const rows = await loadRows(organizationId);
  const groups = new Map<string, { name: string; sources: Set<string>; roles: number }>();
  for (const row of rows) {
    const key = systemGroupKey(row.system);
    const group = groups.get(key) ?? { name: row.system.split('(')[0].trim(), sources: new Set(), roles: 0 };
    group.sources.add(row.system.trim());
    group.roles++;
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    name: g.name,
    sources: [...g.sources],
    roleCount: g.roles,
    merged: g.sources.size > 1,
  }));
}

/**
 * Step 2: create a manual system per confirmed group and its approved roles.
 * Idempotent: systems match by name and roles upsert on (system, name).
 */
export async function applyRbacImport({
  organizationId,
  groups,
}: {
  organizationId: string;
  groups: RbacImportGroup[];
}) {
  const rows = await loadRows(organizationId);
  if (rows.length === 0) throw new BadRequestException('No RBAC matrix rows to import');
  const members = await db.member.findMany({
    where: { organizationId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const findMember = (approvedBy?: string) => {
    const name = approvedBy?.split(',')[0].trim().toLowerCase();
    if (!name) return null;
    return members.find((m) => m.user.name?.trim().toLowerCase() === name || m.user.email.toLowerCase() === name) ?? null;
  };
  const existing = await db.accessSystem.findMany({ where: { organizationId }, select: { id: true, name: true } });

  let systems = 0;
  let roles = 0;
  for (const group of groups) {
    const sources = new Set(group.sources.map((s) => s.trim()));
    const groupRows = rows.filter((r) => sources.has(r.system.trim()));
    if (groupRows.length === 0) continue;
    const name = group.name.trim();
    const system =
      existing.find((s) => s.name.toLowerCase() === name.toLowerCase()) ??
      (await db.accessSystem.create({
        data: { organizationId, name, description: 'Imported from the RBAC matrix' },
        select: { id: true, name: true },
      }));
    if (!existing.some((s) => s.id === system.id)) {
      existing.push(system);
      systems++;
    }
    const systemKey = `manual:${system.id}`;
    for (const row of groupRows) {
      const approver = findMember(row.approvedBy);
      const reviewed = row.lastReviewed ? new Date(row.lastReviewed) : null;
      const reviewedAt = reviewed && !Number.isNaN(reviewed.getTime()) ? reviewed : null;
      const roleName = row.roleName.trim();
      const data = {
        systemName: system.name,
        permissionsScope: row.permissionsScope?.trim() || null,
        isPrivileged: PRIVILEGED.test(roleName),
        approvedById: approver?.id ?? null,
        approvedByName: approver ? approver.user.name || approver.user.email : (row.approvedBy?.trim() || null),
        approvedAt: approver ? reviewedAt : null,
        lastReviewedAt: reviewedAt,
      };
      await db.accessSystemRole.upsert({
        where: { organizationId_systemKey_name: { organizationId, systemKey, name: roleName } },
        create: { organizationId, systemKey, name: roleName, ...data },
        update: data,
      });
      roles++;
    }
  }
  return { systems, roles };
}
