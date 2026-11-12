import { z } from 'zod';
import { CRYPTO_PROTECTION_METHODS, YES_NO_VALUES } from './definitions-pci';
import { evidenceFormFileSchema } from './file-schema';
import { required, requiredTrimmed } from './schema-helpers';

const optionalText = z.string().trim().optional();

const cryptographicInventoryRowSchema = z.object({
  dataStore: requiredTrimmed('Data store / endpoint'),
  dataProtected: requiredTrimmed('Data protected'),
  protectionMethod: z.enum(CRYPTO_PROTECTION_METHODS, { error: 'Select a protection method' }),
  algorithmKeyStrength: optionalText,
  protocolCipherSuites: optionalText,
  keyLocation: optionalText,
  keyUsage: optionalText,
  expiryCryptoperiod: optionalText,
  lastRotation: optionalText,
  // Blank is allowed for methods without keys (e.g. truncation).
  prodTestKeysSeparated: z.union([z.enum(YES_NO_VALUES), z.literal('')]).optional(),
  keyCustodian: requiredTrimmed('Key custodian'),
});

export const cryptographicInventoryDataSchema = z.object({
  submissionDate: required('Submission date'),
  cryptoRows: z
    .array(cryptographicInventoryRowSchema)
    .min(1, 'At least one data store or endpoint is required'),
  custodianAcknowledgement: evidenceFormFileSchema,
});

const TWELVE_MONTHS_MESSAGE =
  'Next review date must be after the approval date and within 12 months';

export const targetedRiskAnalysisDataSchema = z
  .object({
    submissionDate: required('Submission date'),
    requirementAddressed: requiredTrimmed('Requirement addressed'),
    assetsProtected: requiredTrimmed('Assets protected'),
    threats: requiredTrimmed('Threats'),
    likelihoodImpactFactors: requiredTrimmed('Likelihood and impact factors'),
    chosenApproach: requiredTrimmed('Chosen frequency / approach and justification'),
    approver: requiredTrimmed('Approver'),
    approvalDate: required('Approval date'),
    nextReviewDate: required('Next review date'),
    evidenceFile: evidenceFormFileSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const approval = Date.parse(data.approvalDate);
    const next = Date.parse(data.nextReviewDate);
    if (Number.isNaN(approval) || Number.isNaN(next)) return;
    const limit = new Date(approval);
    limit.setUTCFullYear(limit.getUTCFullYear() + 1);
    if (next > approval && next <= limit.getTime()) return;
    ctx.addIssue({ code: 'custom', message: TWELVE_MONTHS_MESSAGE, path: ['nextReviewDate'] });
  });

export const significantChangeRecordDataSchema = z.object({
  submissionDate: required('Submission date'),
  changeDescription: requiredTrimmed('Change ID / description'),
  changeDate: required('Change date'),
  systemsAffected: requiredTrimmed('Systems affected'),
  significanceRationale: requiredTrimmed('Why the change is significant'),
  pciRequirementsReconfirmed: requiredTrimmed('PCI DSS requirements re-confirmed'),
  retestLink: requiredTrimmed('Scan / pentest re-run link'),
  docsUpdated: requiredTrimmed('Documentation updated'),
  testDataRemoved: z.enum(YES_NO_VALUES, { error: 'Select Yes or No' }),
  approver: requiredTrimmed('Approver'),
  approvalDate: required('Approval date'),
});
