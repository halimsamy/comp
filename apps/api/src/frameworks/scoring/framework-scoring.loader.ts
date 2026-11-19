import { db, type EvidenceFormType } from '@db';
import {
  evidenceFormDefinitionList,
  isEvidenceFormFresh,
  toDbEvidenceFormType,
  toExternalEvidenceFormType,
} from '@trycompai/company';
import {
  scoreFramework,
  type ApplicabilityStatus,
  type FrameworkScore,
  type ScoringContext,
  type ScoringControl,
} from './framework-scoring';

/** Freshness per form type from the latest non-rejected submission and the form's cadence. */
export async function loadEvidenceFormContext({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}): Promise<ScoringContext & { notRelevantForms: Set<string> }> {
  const [latest, settings] = await Promise.all([
    db.evidenceSubmission.groupBy({
      by: ['formType'],
      where: { organizationId, status: { not: 'rejected' } },
      _max: { submittedAt: true },
    }),
    db.evidenceFormSetting.findMany({
      where: { organizationId },
      select: { formType: true, isNotRelevant: true, cadenceMonthsOverride: true },
    }),
  ]);
  const freshForms = new Set<string>();
  const submittedForms = new Set<string>();
  for (const row of latest) {
    const external = toExternalEvidenceFormType(row.formType);
    if (!row._max.submittedAt || !external) continue;
    submittedForms.add(row.formType);
    const cadenceMonths = settings.find((s) => s.formType === row.formType)?.cadenceMonthsOverride;
    if (isEvidenceFormFresh({ formType: external, lastSubmittedAt: row._max.submittedAt, cadenceMonths, now })) {
      freshForms.add(row.formType);
    }
  }
  return {
    freshForms,
    submittedForms,
    notRelevantForms: new Set<string>([
      ...settings.filter((s) => s.isNotRelevant).map((s) => s.formType),
      // Retired forms (#130): a module and its native-evidence task carry the requirement now.
      ...evidenceFormDefinitionList.filter((f) => f.retiredTo).map((f) => toDbEvidenceFormType(f.type)),
    ]),
  };
}

type Keyed<T> = Map<string, T[]>;
const push = <T>(map: Keyed<T>, key: string, value: T) =>
  map.set(key, [...(map.get(key) ?? []), value]);
const linkKey = (frameworkInstanceId: string, controlId: string) =>
  `${frameworkInstanceId}:${controlId}`;

/**
 * Scores the given framework instances of one organization. Pass
 * `requirementKeys` (all requirement ids of an instance) to also count
 * requirements that have no controls mapped.
 */
export async function loadFrameworkScores({
  organizationId,
  frameworkInstanceIds,
  requirementKeys,
  now = new Date(),
}: {
  organizationId: string;
  frameworkInstanceIds: string[];
  requirementKeys?: Map<string, string[]>;
  now?: Date;
}): Promise<Map<string, FrameworkScore>> {
  const instanceScope = {
    frameworkInstanceId: { in: frameworkInstanceIds },
    frameworkInstance: { organizationId },
  };
  const [maps, policyLinks, taskLinks, documentLinks, applicabilityRows, ctx] = await Promise.all([
    db.requirementMap.findMany({
      where: { ...instanceScope, archivedAt: null },
      select: { frameworkInstanceId: true, controlId: true, requirementId: true, customRequirementId: true },
    }),
    db.frameworkControlPolicyLink.findMany({
      where: { ...instanceScope, policy: { archivedAt: null, isArchived: false } },
      select: { frameworkInstanceId: true, controlId: true, policy: { select: { id: true, status: true } } },
    }),
    db.frameworkControlTaskLink.findMany({
      where: { ...instanceScope, task: { archivedAt: null } },
      select: { frameworkInstanceId: true, controlId: true, task: { select: { id: true, status: true } } },
    }),
    db.frameworkControlDocumentTypeLink.findMany({
      where: instanceScope,
      select: { frameworkInstanceId: true, controlId: true, formType: true },
    }),
    db.requirementApplicability.findMany({
      where: { organizationId, frameworkInstanceId: { in: frameworkInstanceIds } },
      select: { frameworkInstanceId: true, requirementKey: true, status: true },
    }),
    loadEvidenceFormContext({ organizationId, now }),
  ]);

  const controlIds = [...new Set(maps.map((m) => m.controlId))];
  const ismsLinks = controlIds.length
    ? await db.ismsDocumentControlLink.findMany({
        where: { controlId: { in: controlIds }, ismsDocument: { organizationId } },
        select: {
          controlId: true,
          ismsDocument: { select: { id: true, status: true, currentVersionId: true } },
        },
      })
    : [];

  const policies: Keyed<{ id: string; status: string }> = new Map();
  for (const l of policyLinks) push(policies, linkKey(l.frameworkInstanceId, l.controlId), l.policy);
  const tasks: Keyed<{ id: string; status: string }> = new Map();
  for (const l of taskLinks) push(tasks, linkKey(l.frameworkInstanceId, l.controlId), l.task);
  const forms: Keyed<EvidenceFormType> = new Map();
  for (const l of documentLinks) push(forms, linkKey(l.frameworkInstanceId, l.controlId), l.formType);
  const isms: Keyed<{ id: string; published: boolean }> = new Map();
  for (const l of ismsLinks) {
    const doc = l.ismsDocument;
    push(isms, l.controlId, { id: doc.id, published: doc.status === 'approved' || !!doc.currentVersionId });
  }

  const result = new Map<string, FrameworkScore>();
  for (const instanceId of frameworkInstanceIds) {
    const instanceMaps = maps.filter((m) => m.frameworkInstanceId === instanceId);
    const controlsOfInstance = [...new Set(instanceMaps.map((m) => m.controlId))];
    const controls: ScoringControl[] = controlsOfInstance.map((controlId) => {
      const key = linkKey(instanceId, controlId);
      const linkedForms = [...new Set(forms.get(key) ?? [])];
      return {
        id: controlId,
        policies: policies.get(key) ?? [],
        tasks: tasks.get(key) ?? [],
        formTypes: linkedForms.filter((f) => !ctx.notRelevantForms.has(f)),
        hasNotRelevantForms: linkedForms.some((f) => ctx.notRelevantForms.has(f)),
        ismsDocuments: isms.get(controlId) ?? [],
      };
    });

    const controlsByRequirement = new Map<string, string[]>();
    for (const key of requirementKeys?.get(instanceId) ?? []) controlsByRequirement.set(key, []);
    for (const m of instanceMaps) {
      const key = m.requirementId ?? m.customRequirementId;
      if (key) push(controlsByRequirement, key, m.controlId);
    }

    const applicability = new Map<string, ApplicabilityStatus>(
      applicabilityRows
        .filter((row) => row.frameworkInstanceId === instanceId)
        .map((row) => [row.requirementKey, row.status]),
    );

    result.set(
      instanceId,
      scoreFramework({
        controls,
        requirements: [...controlsByRequirement].map(([key, ids]) => ({ key, controlIds: ids })),
        applicability,
        ctx,
        now,
      }),
    );
  }
  return result;
}
