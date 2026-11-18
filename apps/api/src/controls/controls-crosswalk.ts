import { toCsv } from '../tasks/evidence-export/registers/register-csv';
import type { FrameworkRequirements } from './control-requirements';

interface Tally {
  total: number;
  completed: number;
}

export interface CrosswalkControl {
  name: string;
  description: string;
  owner: { name: string; deactivated: boolean } | null;
  status: string;
  frameworks: FrameworkRequirements[];
  evidence: { policies: Tally; tasks: Tally; forms: Tally; ismsDocuments: Tally };
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'Complete',
  in_progress: 'In progress',
  not_started: 'Not started',
  no_evidence: 'No evidence linked',
};

const tally = ({ total, completed }: Tally) => (total === 0 ? '' : `${completed}/${total}`);

/**
 * One row per control, one column per framework with its requirement codes
 * (e.g. "A.5.15; A.5.18" next to "7.2.1; 7.2.2"): the ISO 27001 ↔ PCI DSS crosswalk.
 */
export function buildCrosswalkCsv(controls: CrosswalkControl[]): string {
  const frameworkNames = [
    ...new Set(controls.flatMap((c) => c.frameworks.map((f) => f.frameworkName))),
  ].sort((a, b) => a.localeCompare(b));

  return toCsv({
    headers: [
      'Control',
      'Description',
      'Owner',
      'Status',
      ...frameworkNames.map((name) => `${name} requirements`),
      'Policies published',
      'Tasks done',
      'Evidence forms current',
      'ISMS documents approved',
    ],
    rows: controls.map((c) => [
      c.name,
      c.description,
      c.owner ? `${c.owner.name}${c.owner.deactivated ? ' (left, needs reassignment)' : ''}` : '',
      STATUS_LABEL[c.status] ?? c.status,
      ...frameworkNames.map((name) =>
        c.frameworks
          .filter((f) => f.frameworkName === name)
          .flatMap((f) => f.requirements.map((r) => r.identifier))
          .join('; '),
      ),
      tally(c.evidence.policies),
      tally(c.evidence.tasks),
      tally(c.evidence.forms),
      tally(c.evidence.ismsDocuments),
    ]),
  });
}
