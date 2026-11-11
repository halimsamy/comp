import type { EvidenceFormType as DbEvidenceFormType } from '@db';
import type { RequirementDef } from '../../frameworks/frameworks-requirements.helper';

export type MappedControl = {
  requirementId: string | null;
  customRequirementId: string | null;
  control: {
    name: string;
    policyIds: string[];
    taskIds: string[];
    formTypes: DbEvidenceFormType[];
  };
};

export type RequirementFolder = {
  folder: string;
  requirement: RequirementDef;
  controlNames: string[];
  policyIds: string[];
  taskIds: string[];
  formTypes: DbEvidenceFormType[];
};

/** A readable, cross-platform-safe path segment (keeps case and spaces). */
export function safeSegment(name: string, maxLength = 80): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    // Windows rejects folder names ending in a dot or space.
    .replace(/[. ]+$/, '');
  return cleaned || 'untitled';
}

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

/** One folder per requirement (in framework order) with its deduped evidence. */
export function planRequirementFolders({
  requirements,
  mappings,
}: {
  requirements: RequirementDef[];
  mappings: MappedControl[];
}): RequirementFolder[] {
  const usedFolders = new Set<string>();

  return requirements.map((requirement) => {
    const controls = mappings
      .filter(
        (m) => (m.requirementId ?? m.customRequirementId) === requirement.id,
      )
      .map((m) => m.control);

    const label = requirement.identifier
      ? `${requirement.identifier} ${requirement.name}`
      : requirement.name;
    let folder = safeSegment(label);
    for (let i = 2; usedFolders.has(folder.toLowerCase()); i++) {
      folder = `${safeSegment(label, 74)} (${i})`;
    }
    usedFolders.add(folder.toLowerCase());

    return {
      folder,
      requirement,
      controlNames: unique(controls.map((c) => c.name)),
      policyIds: unique(controls.flatMap((c) => c.policyIds)),
      taskIds: unique(controls.flatMap((c) => c.taskIds)),
      formTypes: unique(controls.flatMap((c) => c.formTypes)),
    };
  });
}

export function buildRequirementReadme({
  folder,
  frameworkName,
  policyNames,
  taskTitles,
  documentTitles,
}: {
  folder: RequirementFolder;
  frameworkName: string;
  policyNames: string[];
  taskTitles: string[];
  documentTitles: string[];
}): string {
  const { requirement, controlNames } = folder;
  const list = (items: string[]) =>
    items.length > 0 ? items.map((item) => `  - ${item}`) : ['  (none)'];

  return [
    `Framework: ${frameworkName}`,
    `Requirement: ${requirement.identifier || '-'}`,
    `Name: ${requirement.name}`,
    `Description: ${requirement.description || '-'}`,
    '',
    'Mapped controls:',
    ...list(controlNames),
    '',
    'Policies (Policies/):',
    ...list(policyNames),
    '',
    'Tasks (Tasks/):',
    ...list(taskTitles),
    '',
    'Documents (Documents/):',
    ...list(documentTitles),
    '',
  ].join('\n');
}
