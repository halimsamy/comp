import type { Prisma } from '@db';
import { deriveContextOfOrganization } from './context';
import { upsertDerivedRows } from './derived-upsert';
import { deriveInterestedParties } from './interested-parties';
import { deriveObjectives } from './objectives';
import { deriveRequirements } from './requirements';
import type { IsmsPlatformData } from './types';

type Tx = Prisma.TransactionClient;

/** Rows that take part in a regenerate: derived ones and edited copies of them. */
const PROVENANCE_ROWS = {
  OR: [{ source: 'derived' as const }, { derivedFrom: { not: null } }],
};
const EXISTING_SELECT = {
  id: true,
  source: true,
  derivedFrom: true,
  position: true,
} as const;

export async function generateContextIssues({
  tx,
  documentId,
  data,
}: {
  tx: Tx;
  documentId: string;
  data: IsmsPlatformData;
}): Promise<void> {
  const text = (row: ReturnType<typeof deriveContextOfOrganization>[number]) => ({
    kind: row.kind,
    category: row.category,
    description: row.description,
    effect: row.effect,
  });
  await upsertDerivedRows({
    derived: deriveContextOfOrganization(data),
    existing: await tx.ismsContextIssue.findMany({
      where: { documentId, ...PROVENANCE_ROWS },
      select: EXISTING_SELECT,
    }),
    update: ({ id, row }) =>
      tx.ismsContextIssue.update({ where: { id }, data: text(row) }),
    createMany: (rows) =>
      tx.ismsContextIssue.createMany({
        data: rows.map(({ row, position }) => ({
          documentId,
          ...text(row),
          source: row.source,
          derivedFrom: row.derivedFrom,
          position,
        })),
      }),
    deleteMany: (ids) =>
      tx.ismsContextIssue.deleteMany({ where: { id: { in: ids } } }),
  });
}

export async function generateInterestedParties({
  tx,
  documentId,
  data,
}: {
  tx: Tx;
  documentId: string;
  data: IsmsPlatformData;
}): Promise<void> {
  const text = (row: ReturnType<typeof deriveInterestedParties>[number]) => ({
    name: row.name,
    category: row.category,
    needsExpectations: row.needsExpectations,
  });
  await upsertDerivedRows({
    derived: deriveInterestedParties(data),
    existing: await tx.ismsInterestedParty.findMany({
      where: { documentId, ...PROVENANCE_ROWS },
      select: EXISTING_SELECT,
    }),
    update: ({ id, row }) =>
      tx.ismsInterestedParty.update({ where: { id }, data: text(row) }),
    createMany: (rows) =>
      tx.ismsInterestedParty.createMany({
        data: rows.map(({ row, position }) => ({
          documentId,
          ...text(row),
          source: row.source,
          derivedFrom: row.derivedFrom,
          position,
        })),
      }),
    deleteMany: (ids) =>
      tx.ismsInterestedParty.deleteMany({ where: { id: { in: ids } } }),
  });
}

export async function generateRequirements({
  tx,
  documentId,
  organizationId,
  frameworkId,
  data,
}: {
  tx: Tx;
  documentId: string;
  organizationId: string;
  frameworkId: string;
  data: IsmsPlatformData;
}): Promise<void> {
  const registerDoc = await tx.ismsDocument.findFirst({
    where: { organizationId, frameworkId, type: 'interested_parties_register' },
    select: { id: true },
  });
  const parties = registerDoc
    ? await tx.ismsInterestedParty.findMany({
        where: { documentId: registerDoc.id },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, category: true },
      })
    : [];

  const text = (row: ReturnType<typeof deriveRequirements>[number]) => ({
    interestedPartyId: row.interestedPartyId,
    partyName: row.partyName,
    requirement: row.requirement,
    treatment: row.treatment,
  });
  await upsertDerivedRows({
    derived: deriveRequirements({ parties, data }),
    existing: await tx.ismsInterestedPartyRequirement.findMany({
      where: { documentId, ...PROVENANCE_ROWS },
      select: EXISTING_SELECT,
    }),
    update: ({ id, row }) =>
      tx.ismsInterestedPartyRequirement.update({ where: { id }, data: text(row) }),
    createMany: (rows) =>
      tx.ismsInterestedPartyRequirement.createMany({
        data: rows.map(({ row, position }) => ({
          documentId,
          ...text(row),
          source: row.source,
          derivedFrom: row.derivedFrom,
          position,
        })),
      }),
    deleteMany: (ids) =>
      tx.ismsInterestedPartyRequirement.deleteMany({
        where: { id: { in: ids } },
      }),
  });
}

export async function generateObjectives({
  tx,
  documentId,
  data,
}: {
  tx: Tx;
  documentId: string;
  data: IsmsPlatformData;
}): Promise<void> {
  const text = (row: ReturnType<typeof deriveObjectives>[number]) => ({
    objective: row.objective,
    target: row.target,
    cadence: row.cadence,
    plan: row.plan,
    measurementMethod: row.measurementMethod,
  });
  await upsertDerivedRows({
    derived: deriveObjectives(data),
    existing: await tx.ismsObjective.findMany({
      where: { documentId, ...PROVENANCE_ROWS },
      select: EXISTING_SELECT,
    }),
    update: ({ id, row }) => tx.ismsObjective.update({ where: { id }, data: text(row) }),
    createMany: (rows) =>
      tx.ismsObjective.createMany({
        data: rows.map(({ row, position }) => ({
          documentId,
          ...text(row),
          source: row.source,
          derivedFrom: row.derivedFrom,
          position,
        })),
      }),
    deleteMany: (ids) => tx.ismsObjective.deleteMany({ where: { id: { in: ids } } }),
  });
}

