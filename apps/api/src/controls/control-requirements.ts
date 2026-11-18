import { Prisma } from '@db';

/** Control fields shared by the controls list and the related-controls panels. */
export const controlSummarySelect = {
  id: true,
  name: true,
  description: true,
  owner: {
    select: {
      id: true,
      deactivated: true,
      user: { select: { name: true, email: true, image: true } },
    },
  },
  requirementsMapped: {
    where: { archivedAt: null },
    select: {
      frameworkInstanceId: true,
      frameworkInstance: {
        select: {
          framework: { select: { name: true } },
          customFramework: { select: { name: true } },
        },
      },
      requirement: { select: { identifier: true, name: true } },
      customRequirement: { select: { identifier: true, name: true } },
    },
  },
} satisfies Prisma.ControlSelect;

export type ControlSummary = Prisma.ControlGetPayload<{
  select: typeof controlSummarySelect;
}>;

export interface FrameworkRequirements {
  frameworkInstanceId: string;
  frameworkName: string;
  requirements: { identifier: string; name: string }[];
}

const byIdentifier = (a: { identifier: string }, b: { identifier: string }) =>
  a.identifier.localeCompare(b.identifier, undefined, { numeric: true });

/**
 * Group a control's requirement mappings per framework instance ("ISO 27001:
 * A.5.15, A.5.18 · PCI DSS: 7.2.1"). `onlyFrameworkInstanceIds` limits the
 * result to the frameworks a link actually counts for.
 */
export function groupRequirementsByFramework({
  requirementsMapped,
  onlyFrameworkInstanceIds,
}: {
  requirementsMapped: ControlSummary['requirementsMapped'];
  onlyFrameworkInstanceIds?: Set<string>;
}): FrameworkRequirements[] {
  const byFramework = new Map<string, FrameworkRequirements>();
  for (const rm of requirementsMapped) {
    if (onlyFrameworkInstanceIds && !onlyFrameworkInstanceIds.has(rm.frameworkInstanceId)) {
      continue;
    }
    const req = rm.requirement ?? rm.customRequirement;
    if (!req) continue;
    const frameworkName =
      rm.frameworkInstance.framework?.name ?? rm.frameworkInstance.customFramework?.name ?? 'Framework';
    const entry = byFramework.get(rm.frameworkInstanceId) ?? {
      frameworkInstanceId: rm.frameworkInstanceId,
      frameworkName,
      requirements: [],
    };
    if (!entry.requirements.some((r) => r.identifier === req.identifier)) {
      entry.requirements.push({ identifier: req.identifier, name: req.name });
    }
    byFramework.set(rm.frameworkInstanceId, entry);
  }
  return [...byFramework.values()]
    .map((f) => ({ ...f, requirements: f.requirements.sort(byIdentifier) }))
    .sort((a, b) => a.frameworkName.localeCompare(b.frameworkName));
}

export function toOwner(owner: ControlSummary['owner']) {
  if (!owner) return null;
  return {
    id: owner.id,
    name: owner.user.name || owner.user.email,
    email: owner.user.email,
    image: owner.user.image,
    // Owner left the company: the control needs reassignment.
    deactivated: owner.deactivated,
  };
}
