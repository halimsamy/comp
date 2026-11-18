import { db } from '@db';
import { getActiveManifests } from '@trycompai/integration-platform';
import { templatesForMapping } from '../integration-platform/utils/task-template-successors';

export interface IntegrationCoverage {
  providerSlug: string;
  /** Org tasks the provider's checks can collect evidence for. */
  tasks: number;
  /** Of those, tasks not yet done (manual work the integration would remove). */
  openTasks: number;
  /** Distinct framework requirements those tasks satisfy, per framework. */
  frameworks: Array<{ name: string; requirements: number }>;
}

interface ManifestLike {
  id: string;
  checks?: ReadonlyArray<{ taskMapping?: string }>;
}

/**
 * "Closes N tasks · X ISO / Y PCI requirements" for every integration: the org's
 * tasks matching each check's task template, followed through the framework
 * control links to the requirements they evidence.
 */
export async function loadIntegrationCoverage({
  organizationId,
  manifests = getActiveManifests(),
}: {
  organizationId: string;
  manifests?: ReadonlyArray<ManifestLike>;
}): Promise<IntegrationCoverage[]> {
  const templatesByProvider = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    const templates = new Set(
      (manifest.checks ?? [])
        .flatMap((c) => (c.taskMapping ? templatesForMapping(c.taskMapping) : [])),
    );
    if (templates.size > 0) templatesByProvider.set(manifest.id, templates);
  }
  const allTemplates = [
    ...new Set([...templatesByProvider.values()].flatMap((s) => [...s])),
  ];
  if (allTemplates.length === 0) return [];

  const tasks = await db.task.findMany({
    where: {
      organizationId,
      archivedAt: null,
      taskTemplateId: { in: allTemplates },
    },
    select: {
      status: true,
      taskTemplateId: true,
      frameworkControlLinks: {
        select: { frameworkInstanceId: true, controlId: true },
      },
    },
  });
  const controlIds = [
    ...new Set(
      tasks.flatMap((t) => t.frameworkControlLinks.map((l) => l.controlId)),
    ),
  ];
  const maps = controlIds.length
    ? await db.requirementMap.findMany({
        where: {
          archivedAt: null,
          controlId: { in: controlIds },
          frameworkInstance: { organizationId },
        },
        select: {
          frameworkInstanceId: true,
          controlId: true,
          requirementId: true,
          customRequirementId: true,
          frameworkInstance: {
            select: {
              framework: { select: { name: true } },
              customFramework: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const requirementsByLink = new Map<
    string,
    Array<{ framework: string; requirement: string }>
  >();
  for (const map of maps) {
    const requirement = map.requirementId ?? map.customRequirementId;
    if (!requirement) continue;
    const framework =
      map.frameworkInstance.framework?.name ??
      map.frameworkInstance.customFramework?.name ??
      'Framework';
    const key = `${map.frameworkInstanceId}:${map.controlId}`;
    const list = requirementsByLink.get(key) ?? [];
    list.push({ framework, requirement });
    requirementsByLink.set(key, list);
  }

  const result: IntegrationCoverage[] = [];
  for (const [providerSlug, templates] of templatesByProvider) {
    const providerTasks = tasks.filter(
      (t) => t.taskTemplateId && templates.has(t.taskTemplateId),
    );
    const requirements = new Map<string, Set<string>>();
    for (const task of providerTasks) {
      for (const link of task.frameworkControlLinks) {
        for (const r of requirementsByLink.get(
          `${link.frameworkInstanceId}:${link.controlId}`,
        ) ?? []) {
          const set = requirements.get(r.framework) ?? new Set<string>();
          set.add(r.requirement);
          requirements.set(r.framework, set);
        }
      }
    }
    result.push({
      providerSlug,
      tasks: providerTasks.length,
      openTasks: providerTasks.filter(
        (t) => t.status !== 'done' && t.status !== 'not_relevant',
      ).length,
      frameworks: [...requirements]
        .map(([name, set]) => ({ name, requirements: set.size }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return result;
}
