import type { ControlOverview } from '@/hooks/use-controls-overview';

/** Test fixtures: ISO + PCI mapped, ISO-only with a departed owner, and an unmapped control. */
export const tally = (completed: number, total: number) => ({ completed, total });
const none = { policies: tally(0, 0), tasks: tally(0, 0), forms: tally(0, 0), ismsDocuments: tally(0, 0) };

const iso = (identifier: string) => ({
  frameworkInstanceId: 'fi_iso',
  frameworkName: 'ISO 27001',
  requirements: [{ identifier, name: identifier }],
});
const pci = (identifier: string) => ({
  frameworkInstanceId: 'fi_pci',
  frameworkName: 'PCI DSS Level 1',
  requirements: [{ identifier, name: identifier }],
});

export const CONTROLS: ControlOverview[] = [
  {
    id: 'ctl_access',
    name: 'Access Rights',
    description: 'Least privilege',
    owner: { id: 'mem_ada', name: 'Ada', email: 'ada@x.io', image: null, deactivated: false },
    frameworks: [iso('A.5.15'), pci('7.2.1')],
    evidence: { ...none, policies: tally(1, 1), tasks: tally(1, 2) },
    status: 'in_progress',
  },
  {
    id: 'ctl_context',
    name: 'Context of the organization',
    description: '',
    owner: { id: 'mem_bob', name: 'Bob', email: 'bob@x.io', image: null, deactivated: true },
    frameworks: [iso('4.1')],
    evidence: { ...none, ismsDocuments: tally(1, 1) },
    status: 'completed',
  },
  {
    id: 'ctl_custom',
    name: 'Custom control',
    description: '',
    owner: null,
    frameworks: [],
    evidence: none,
    status: 'no_evidence',
  },
];

