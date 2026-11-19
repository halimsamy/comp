export const CHECKLIST_SECTIONS = [
  {
    id: 'program',
    title: 'Set up your program',
    description: 'Choose your frameworks and describe your company.',
  },
  {
    id: 'systems',
    title: 'Connect key systems',
    description: 'Integrations collect evidence for you and keep it fresh.',
  },
  {
    id: 'policies',
    title: 'Launch policies',
    description: 'Publish your policies and get every employee to accept them.',
  },
  {
    id: 'isms',
    title: 'Define your ISMS and scope',
    description:
      'The ISO 27001 clause 4–10 documents, the SoA and your PCI DSS scope.',
  },
  {
    id: 'people',
    title: 'Bring in your team',
    description: 'Invite teammates and enroll their devices.',
  },
  {
    id: 'risk',
    title: 'Manage risk',
    description:
      'Assess risks and vendors, and record residual risk acceptance.',
  },
  {
    id: 'audit',
    title: 'Prepare for your audit',
    description: 'Collect evidence and give your auditor access.',
  },
] as const;

/** Every item id the guide can show. The skip endpoint only accepts these. */
export const CHECKLIST_ITEM_IDS = [
  'frameworks',
  'company_profile',
  'idle_timeout',
  'control_owners',
  'isms_profile',
  'identity_provider',
  'cloud_provider',
  'version_control',
  'policies_published',
  'policies_acknowledged',
  'isms_documents',
  'statement_of_applicability',
  'assets_scoped',
  'pci_scope',
  'invite_team',
  'device_monitoring',
  'risks_assessed',
  'risk_acceptance',
  'vendors_classified',
  'vendors_assessed',
  'evidence_forms',
  'evidence_tasks',
  'auditor_access',
] as const;

export type ChecklistItemId = (typeof CHECKLIST_ITEM_IDS)[number];

/** Mandatory audit inputs: ISO 27001 6.1.3 d) SoA, clauses 4–10, PCI DSS 12.5.2 scope. */
export const NON_SKIPPABLE_ITEM_IDS: readonly ChecklistItemId[] = [
  'isms_documents',
  'statement_of_applicability',
  'pci_scope',
];
