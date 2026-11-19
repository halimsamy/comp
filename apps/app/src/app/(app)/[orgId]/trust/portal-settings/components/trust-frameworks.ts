export type TrustFrameworkKey =
  | 'iso27001'
  | 'iso42001'
  | 'gdpr'
  | 'hipaa'
  | 'soc2type1'
  | 'soc2type2'
  | 'soc3'
  | 'pcidss'
  | 'nen7510'
  | 'iso9001'
  | 'pipeda'
  | 'ccpa';

export type TrustFrameworkStatus = 'started' | 'in_progress' | 'compliant';
export type LiveTrustStatus = 'in_progress' | 'compliant';
export type LiveFrameworkStatusMap = Partial<Record<TrustFrameworkKey, LiveTrustStatus>>;

export interface TrustFrameworkValue {
  enabled: boolean;
  status: TrustFrameworkStatus;
}

/** Built-in trust portal frameworks. `title` also picks the logo in ComplianceFramework. */
export const TRUST_FRAMEWORKS: { key: TrustFrameworkKey; title: string; description: string }[] = [
  {
    key: 'iso27001',
    title: 'ISO 27001',
    description: 'An international standard for managing information security systems.',
  },
  {
    key: 'iso42001',
    title: 'ISO 42001',
    description: 'An international standard for an Artificial Intelligence Management System.',
  },
  {
    key: 'gdpr',
    title: 'GDPR',
    description: 'A European regulation that governs personal data protection and user privacy.',
  },
  {
    key: 'hipaa',
    title: 'HIPAA',
    description:
      'A US regulation that protects sensitive patient health information and medical data.',
  },
  {
    key: 'soc2type1',
    title: 'SOC 2 Type 1',
    description:
      'A compliance framework focused on data security, availability, and confidentiality.',
  },
  {
    key: 'soc2type2',
    title: 'SOC 2 Type 2',
    description:
      'A compliance framework focused on data security, availability, and confidentiality.',
  },
  {
    key: 'soc3',
    title: 'SOC 3',
    description:
      'A compliance framework focused on data security, availability, and confidentiality.',
  },
  {
    key: 'pcidss',
    title: 'PCI DSS',
    description:
      'The payment card industry standard for protecting cardholder data and the systems that store, process or transmit it.',
  },
  {
    key: 'nen7510',
    title: 'NEN 7510',
    description: 'A Dutch standard for managing information security systems.',
  },
  {
    key: 'iso9001',
    title: 'ISO 9001',
    description: 'An international standard for quality management systems.',
  },
  {
    key: 'pipeda',
    title: 'PIPEDA',
    description: 'Personal Information Protection and Electronic Documents Act',
  },
  { key: 'ccpa', title: 'CCPA', description: 'California Consumer Privacy Act' },
];

/** The org's own frameworks first (catalog order kept within each group). */
export function sortTrustFrameworks(live: LiveFrameworkStatusMap) {
  return [...TRUST_FRAMEWORKS].sort((a, b) => Number(!!live[b.key]) - Number(!!live[a.key]));
}
