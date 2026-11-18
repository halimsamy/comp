import type { ChecklistKind } from '@db';

/** Native state an onboarding item can complete itself from. */
export const CHECKLIST_AUTO_SOURCES = [
  'policies',
  'training',
  'device',
  'background_check',
] as const;
export type ChecklistAutoSource = (typeof CHECKLIST_AUTO_SOURCES)[number];

interface DefaultChecklistItem {
  title: string;
  description: string;
  evidenceRequired: boolean;
  isAccessRevocation: boolean;
  sortOrder: number;
  dueDays?: number;
  autoCompleteSource?: ChecklistAutoSource;
}

/** PCI DSS 8.2.5 / ISO 27001 A.5.18, A.6.5: access goes on the last day. Due days count from the offboard date. */
export const DEFAULT_OFFBOARDING_CHECKLIST_ITEMS: readonly DefaultChecklistItem[] = [
  {
    title: 'Revoke system access',
    description:
      "Disable or remove the employee's access to all company systems, applications, and cloud services.",
    evidenceRequired: true,
    isAccessRevocation: true,
    sortOrder: 1,
    dueDays: 0,
  },
  {
    title: 'Remove from identity provider',
    description:
      'Remove the employee from your identity provider (e.g., Okta, Azure AD, Google Workspace).',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 2,
    dueDays: 0,
  },
  {
    title: 'Retrieve company devices',
    description:
      'Collect all company-owned hardware including laptops, phones, access badges, and security keys.',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 3,
    dueDays: 7,
  },
  {
    title: 'Deactivate email and accounts',
    description:
      "Deactivate or redirect the employee's email account and remove from shared mailboxes and distribution lists.",
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 4,
    dueDays: 0,
  },
  {
    title: 'Revoke privileged access',
    description:
      'Remove any elevated permissions, admin rights, SSH keys, API tokens, or shared credentials the employee had access to.',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 5,
    dueDays: 0,
  },
  {
    title: 'Notify relevant teams',
    description:
      "Inform the employee's team, IT, HR, and any relevant stakeholders of the departure.",
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 6,
    dueDays: 1,
  },
  {
    title: 'Exit interview completed',
    description:
      'Conduct an exit interview covering security reminders and NDA obligations.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 7,
    dueDays: 0,
  },
  {
    title: 'Update org chart and documentation',
    description:
      'Remove the employee from the org chart, on-call rotations, and internal documentation.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 8,
    dueDays: 7,
  },
  {
    title: 'Collect office keys and access badges',
    description:
      'Collect physical keys, access cards and badges, and deactivate badge access in the building or office access system.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 9,
    dueDays: 0,
  },
];

/** ISO 27001 A.6.1-A.6.3, A.5.15; PCI DSS 12.6.3, 12.7.1, 8.2.4. Due days count from the start date. */
export const DEFAULT_ONBOARDING_CHECKLIST_ITEMS: readonly DefaultChecklistItem[] = [
  {
    title: 'Employment contract signed',
    description:
      'Signed contract or terms of engagement that state information security responsibilities.',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 1,
    dueDays: 0,
  },
  {
    title: 'Confidentiality agreement (NDA) signed',
    description: 'Signed non-disclosure or confidentiality agreement.',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 2,
    dueDays: 0,
  },
  {
    title: 'Background check completed',
    description:
      'Screening completed before access to sensitive systems or cardholder data, or an exemption recorded.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 3,
    dueDays: 0,
    autoCompleteSource: 'background_check',
  },
  {
    title: 'Access provisioned based on role',
    description:
      'Access granted per the approved role, following least privilege. Attach the approved access request.',
    evidenceRequired: true,
    isAccessRevocation: false,
    sortOrder: 4,
    dueDays: 7,
  },
  {
    title: 'Security policies accepted',
    description: 'The employee accepted every policy they must sign in the employee portal.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 5,
    dueDays: 30,
    autoCompleteSource: 'policies',
  },
  {
    title: 'Security awareness training completed',
    description:
      'Security awareness training and every role-based training module assigned to the employee are completed.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 6,
    dueDays: 30,
    autoCompleteSource: 'training',
  },
  {
    title: 'Device secured and enrolled',
    description: 'The employee device runs the device agent and passes every security check.',
    evidenceRequired: false,
    isAccessRevocation: false,
    sortOrder: 7,
    dueDays: 30,
    autoCompleteSource: 'device',
  },
];

export const DEFAULT_CHECKLIST_ITEMS: Record<ChecklistKind, readonly DefaultChecklistItem[]> = {
  onboarding: DEFAULT_ONBOARDING_CHECKLIST_ITEMS,
  offboarding: DEFAULT_OFFBOARDING_CHECKLIST_ITEMS,
};
