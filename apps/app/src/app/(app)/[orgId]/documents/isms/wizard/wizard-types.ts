/**
 * Client-side schema + types for the ISMS setup wizard (CS-438). Mirrors the
 * NestJS `/v1/isms/profile` contract (apps/api/src/isms/wizard/wizard-schema.ts).
 * The wizard form validates against the full schema on completion; per-step saves
 * send partial slices that the API shallow-merges onto the stored answers.
 */

import { z } from 'zod';

export const EU_REP_STATUSES = ['appointed', 'not_required', 'pending'] as const;

export const SECTOR_REGULATOR_OPTIONS = [
  'FINMA',
  'FCA',
  'HIPAA',
  'PCI DSS',
  'healthcare',
  'critical_infrastructure',
] as const;

export const EU_REP_LABELS: Record<(typeof EU_REP_STATUSES)[number], string> = {
  appointed: 'Appointed',
  not_required: 'Not required',
  pending: 'Pending',
};

export const SECTOR_REGULATOR_LABELS: Record<string, string> = {
  FINMA: 'FINMA',
  FCA: 'FCA',
  HIPAA: 'HIPAA',
  'PCI DSS': 'PCI DSS',
  healthcare: 'Healthcare',
  critical_infrastructure: 'Critical infrastructure',
};

/** Custom regulator free-text values are stored with this prefix. */
export const CUSTOM_REGULATOR_PREFIX = 'custom:';

const objectiveSchema = z.object({
  objective: z.string().min(1, 'Objective is required'),
  target: z.string(),
});

/**
 * The full wizard form schema. Mirrors `wizardAnswersSchema` on the API. Every
 * field is present (the form always seeds defaults), so this is the shape the
 * client both edits and submits.
 */
export const wizardFormSchema = z.object({
  certificationBody: z.string(),
  insurance: z.object({
    has: z.boolean(),
    insurerName: z.string(),
  }),
  sectorRegulators: z.array(z.string()),
  hasContractors: z.boolean(),
  capabilitiesInProduction: z.array(z.string()),
  cloudScopeSplit: z.object({
    customer: z.array(z.string()),
    provider: z.array(z.string()),
  }),
  euRep: z.object({
    status: z.enum(EU_REP_STATUSES),
    name: z.string(),
  }),
  certificateScopeSentence: z.string().min(1, 'The certificate scope sentence is required'),
  objectives: z.array(objectiveSchema),
  intendedOutcomes: z.array(z.string()),
});

export type WizardFormValues = z.infer<typeof wizardFormSchema>;

/** Partial answers (per-step save body). Deep-partial mirrors the API. */
export type PartialWizardAnswers = Partial<{
  certificationBody: string;
  insurance: Partial<WizardFormValues['insurance']>;
  sectorRegulators: string[];
  hasContractors: boolean;
  capabilitiesInProduction: string[];
  cloudScopeSplit: Partial<WizardFormValues['cloudScopeSplit']>;
  euRep: Partial<WizardFormValues['euRep']>;
  certificateScopeSentence: string;
  objectives: WizardFormValues['objectives'];
  intendedOutcomes: string[];
}>;

export interface WizardMemberOption {
  id: string;
  name: string;
}

export interface WizardDefaults {
  capabilitiesInProduction: string[];
  certificateScopeSentence: string;
  objectives: Array<{ objective: string; target: string }>;
  intendedOutcomes: string[];
  cloudScopeSplit: { customer: string[]; provider: string[] };
  sectorRegulatorOptions: string[];
}

/** Defaults used when the profile (or its defaults) has not loaded yet. */
export const EMPTY_WIZARD_DEFAULTS: WizardDefaults = {
  capabilitiesInProduction: [],
  certificateScopeSentence: '',
  objectives: [],
  intendedOutcomes: [],
  cloudScopeSplit: { customer: [], provider: [] },
  sectorRegulatorOptions: [],
};

/** The `data` payload of GET /v1/isms/profile. */
export interface WizardProfileResponse {
  answers: PartialWizardAnswers | null;
  defaults: WizardDefaults;
  members: WizardMemberOption[];
  /** Rows in the 6.2 Objectives register; once > 0 the objectives are edited there. */
  objectiveRowCount?: number;
}

export interface SaveProfileResponse {
  id: string;
  answers: PartialWizardAnswers;
  completedAt: string | null;
}
