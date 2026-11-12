import type { EvidenceFormType } from './form-types';
import type { EvidenceFormDefinition } from './types';

type PciEvidenceFormType = Extract<
  EvidenceFormType,
  'cryptographic-inventory' | 'targeted-risk-analysis' | 'significant-change-record'
>;

export const CRYPTO_PROTECTION_METHODS = [
  'Token',
  'Truncation',
  'Keyed hash',
  'Field encryption',
  'Disk encryption',
  'TLS',
  'Other',
] as const;

export const YES_NO_VALUES = ['Yes', 'No'] as const;

const toOptions = (values: ReadonlyArray<string>) =>
  values.map((value) => ({ label: value, value }));

const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.xlsx,.xls';

// PCI-specific forms follow the account-types precedent: hidden from the global
// Documents list and optional for the org-wide score; they are reached from the
// control they are linked to in the Framework Editor.
export const pciEvidenceFormDefinitions: Record<PciEvidenceFormType, EvidenceFormDefinition> = {
  'cryptographic-inventory': {
    type: 'cryptographic-inventory',
    title: 'Cryptographic Inventory',
    description:
      'Maintain an inventory of the cryptography protecting sensitive data: keys, certificates, protocols and cipher suites, with their custodians. Review it at least yearly and whenever it changes.',
    category: 'Security',
    submissionDateMode: 'custom',
    portalAccessible: false,
    hidden: true,
    optional: true,
    fields: [
      {
        key: 'cryptoRows',
        label: 'Cryptographic inventory',
        type: 'matrix',
        required: true,
        description: 'One row per data store or endpoint.',
        addRowLabel: 'Add data store / endpoint',
        columns: [
          {
            key: 'dataStore',
            label: 'Data store / endpoint',
            required: true,
            placeholder: 'e.g. orders-db (RDS)',
          },
          {
            key: 'dataProtected',
            label: 'Data protected',
            required: true,
            placeholder: 'e.g. no PAN – PSP-hosted',
          },
          {
            key: 'protectionMethod',
            label: 'Protection method',
            required: true,
            type: 'select',
            options: toOptions(CRYPTO_PROTECTION_METHODS),
          },
          {
            key: 'algorithmKeyStrength',
            label: 'Algorithm & key strength',
            placeholder: 'e.g. AES-256-GCM',
          },
          {
            key: 'protocolCipherSuites',
            label: 'Protocol & cipher suites',
            placeholder: 'e.g. TLS 1.2+, ECDHE-RSA-AES256-GCM-SHA384',
          },
          {
            key: 'keyLocation',
            label: 'Key/cert ID and location',
            placeholder: 'e.g. alias/orders-db in AWS KMS',
            description: 'KMS, HSM or secret manager',
          },
          { key: 'keyUsage', label: 'Key usage', placeholder: 'e.g. Data encryption' },
          { key: 'expiryCryptoperiod', label: 'Expiry / cryptoperiod', placeholder: 'e.g. 1 year' },
          { key: 'lastRotation', label: 'Last rotation', placeholder: 'YYYY-MM-DD' },
          {
            key: 'prodTestKeysSeparated',
            label: 'Prod/test keys separated',
            type: 'select',
            options: toOptions(YES_NO_VALUES),
          },
          {
            key: 'keyCustodian',
            label: 'Key custodian',
            required: true,
            placeholder: 'e.g. Jane Doe, Platform Lead',
          },
        ],
      },
      {
        key: 'custodianAcknowledgement',
        label: 'Key custodian acknowledgement',
        type: 'file',
        required: true,
        accept: ATTACHMENT_ACCEPT,
        description:
          'Signed acknowledgement from each key custodian that they understand and accept their responsibilities',
      },
    ],
  },
  'targeted-risk-analysis': {
    type: 'targeted-risk-analysis',
    title: 'Targeted Risk Analysis',
    description:
      'Document one targeted risk analysis (PCI DSS 12.3.1 / 12.3.2) per submission. Review each analysis at least every 12 months.',
    category: 'Security',
    submissionDateMode: 'custom',
    portalAccessible: false,
    hidden: true,
    optional: true,
    fields: [
      {
        key: 'requirementAddressed',
        label: 'Requirement addressed',
        type: 'text',
        required: true,
        description: 'The requirement this analysis supports',
        placeholder: 'e.g. PCI DSS 5.3.2.1',
      },
      {
        key: 'assetsProtected',
        label: 'Assets protected',
        type: 'textarea',
        required: true,
        description: 'Systems, data and processes the requirement protects',
      },
      {
        key: 'threats',
        label: 'Threats',
        type: 'textarea',
        required: true,
        description: 'Threats the requirement protects against',
      },
      {
        key: 'likelihoodImpactFactors',
        label: 'Likelihood and impact factors',
        type: 'textarea',
        required: true,
        description: 'Factors that raise or lower the likelihood and impact of each threat',
      },
      {
        key: 'chosenApproach',
        label: 'Chosen frequency / approach and justification',
        type: 'textarea',
        required: true,
        description: 'The frequency or approach chosen and why it addresses the risk',
      },
      {
        key: 'approver',
        label: 'Approver',
        type: 'text',
        required: true,
        placeholder: 'e.g. Jane Doe, CISO',
      },
      { key: 'approvalDate', label: 'Approval date', type: 'date', required: true },
      {
        key: 'nextReviewDate',
        label: 'Next review date',
        type: 'date',
        required: true,
        description: 'At most 12 months after the approval date',
      },
      {
        key: 'evidenceFile',
        label: 'Supporting attachment',
        type: 'file',
        required: false,
        accept: ATTACHMENT_ACCEPT,
      },
    ],
  },
  'significant-change-record': {
    type: 'significant-change-record',
    title: 'Significant Change Record',
    description:
      'Record one significant change per submission and confirm the applicable PCI DSS requirements were re-validated.',
    category: 'Security',
    submissionDateMode: 'custom',
    portalAccessible: false,
    hidden: true,
    optional: true,
    fields: [
      {
        key: 'changeDescription',
        label: 'Change ID / description',
        type: 'textarea',
        required: true,
        description: 'Change ticket ID and a short description of the change',
      },
      { key: 'changeDate', label: 'Change date', type: 'date', required: true },
      {
        key: 'systemsAffected',
        label: 'Systems affected',
        type: 'textarea',
        required: true,
      },
      {
        key: 'significanceRationale',
        label: 'Why the change is significant',
        type: 'textarea',
        required: true,
      },
      {
        key: 'pciRequirementsReconfirmed',
        label: 'PCI DSS requirements re-confirmed',
        type: 'textarea',
        required: true,
        description: 'Requirements confirmed to be in place on the new or changed systems',
      },
      {
        key: 'retestLink',
        label: 'Scan / pentest re-run link',
        type: 'text',
        required: true,
        description: 'Link to the vulnerability scan or penetration test re-run after the change',
        placeholder: 'https://...',
      },
      {
        key: 'docsUpdated',
        label: 'Documentation updated',
        type: 'textarea',
        required: true,
        description: 'Network diagrams, system inventory and scope documents updated',
      },
      {
        key: 'testDataRemoved',
        label: 'Test data and accounts removed',
        type: 'select',
        required: true,
        options: toOptions(YES_NO_VALUES),
      },
      {
        key: 'approver',
        label: 'Approver',
        type: 'text',
        required: true,
        placeholder: 'e.g. Jane Doe, CISO',
      },
      { key: 'approvalDate', label: 'Approval date', type: 'date', required: true },
    ],
  },
};
