import { db } from '@db';

type MappedRequirement = {
  frameworkInstanceId: string;
  requirementId: string | null;
  customRequirementId: string | null;
};

/**
 * Applicability status per mapped requirement, keyed `${frameworkInstanceId}:${requirementKey}`.
 * Requirements without a record are applicable (the default).
 */
export async function loadMappedApplicability({
  organizationId,
  maps,
}: {
  organizationId: string;
  maps: MappedRequirement[];
}): Promise<Record<string, string>> {
  const pairs = maps.flatMap((m) => {
    const requirementKey = m.requirementId ?? m.customRequirementId;
    return requirementKey ? [{ frameworkInstanceId: m.frameworkInstanceId, requirementKey }] : [];
  });
  if (pairs.length === 0) return {};
  const records = await db.requirementApplicability.findMany({
    where: { organizationId, OR: pairs },
    select: { frameworkInstanceId: true, requirementKey: true, status: true },
  });
  return Object.fromEntries(
    records.map((r) => [`${r.frameworkInstanceId}:${r.requirementKey}`, r.status]),
  );
}
