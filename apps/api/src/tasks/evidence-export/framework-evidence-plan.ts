import type { EvidenceFormType as DbEvidenceFormType } from '@db';
import type { RequirementDef } from '../../frameworks/frameworks-requirements.helper';
import { registersForControlTemplates } from './native-artifact-control-map';
import type { RegisterKey } from './registers/registers';

export type MappedControl = {
  requirementId: string | null;
  customRequirementId: string | null;
  control: {
    id: string;
    controlTemplateId: string | null;
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
  controlIds: string[];
  policyIds: string[];
  taskIds: string[];
  formTypes: DbEvidenceFormType[];
  /** Platform registers that evidence this requirement's controls. */
  registers: RegisterKey[];
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

    // ISO requirement names already start with their identifier ("6.1.3 Planning").
    const label =
      requirement.identifier && !requirement.name.startsWith(requirement.identifier)
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
      controlIds: unique(controls.map((c) => c.id)),
      policyIds: unique(controls.flatMap((c) => c.policyIds)),
      taskIds: unique(controls.flatMap((c) => c.taskIds)),
      formTypes: unique(controls.flatMap((c) => c.formTypes)),
      registers: registersForControlTemplates(controls.map((c) => c.controlTemplateId)),
    };
  });
}

export function buildRequirementReadme({
  folder,
  frameworkName,
  policyNames,
  taskTitles,
  documentTitles,
  nativeTitles = [],
}: {
  folder: RequirementFolder;
  frameworkName: string;
  policyNames: string[];
  taskTitles: string[];
  documentTitles: string[];
  /** ISMS documents, SoA and registers placed in this folder. */
  nativeTitles?: string[];
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
    'Platform records (ISMS/, Registers/):',
    ...list(nativeTitles),
    '',
  ].join('\n');
}
