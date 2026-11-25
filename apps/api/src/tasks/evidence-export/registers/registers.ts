import type { GRCResource } from '../../../auth/require-permission.decorator';
import {
  buildAccessReviewsCsv,
  buildAccessRolesCsv,
  buildPrivilegedUsersCsv,
} from './access-register';
import { exportAcknowledgementsCsv } from '../../../policies/lifecycle/acknowledgement-export';
import { buildAssetRegisterCsv } from './asset-register';
import { buildDeviceRegisterCsv } from './device-register';
import { buildFindingsRegisterCsv, loadFindingsTable } from './findings-register';
import { buildOffboardingRegisterCsv } from './offboarding-register';
import { buildPeopleRegisterCsv } from './people-register';
import type { CitedTable, RegisterParams } from './register-csv';
import {
  buildTrainingRecordsCsv,
  buildVendorReviewsCsv,
  loadTrainingRecordsTable,
} from './records-register';
import { buildRiskAcceptancesCsv, buildRiskRegisterCsv } from './risk-register';
import {
  buildRiskReviewsCsv,
  buildRiskTreatmentActionsCsv,
} from './risk-review-register';
import { buildVendorRegisterCsv } from './vendor-register';
import { buildVulnerabilityRegisterCsv } from './vulnerability-register';

export const REGISTER_KEYS = [
  'risks',
  'risk-acceptances',
  'vendors',
  'people',
  'devices',
  'offboarding',
  'findings',
  'assets',
  'vulnerabilities',
  'access-reviews',
  'privileged-users',
  'access-roles',
  'training-records',
  'vendor-reviews',
  'risk-reviews',
  'risk-treatment-actions',
  'policy-acknowledgements',
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

export type RegisterDefinition = {
  title: string;
  fileName: string;
  /** The `<resource>:read` permission a caller needs to see this register. */
  resource: GRCResource;
  build: (params: RegisterParams) => Promise<string>;
  /**
   * Rows with the requirements each one cites; a requirement folder gets the
   * rows citing it (e.g. findings naming "PCI DSS 10.6.2").
   */
  cited?: (params: RegisterParams) => Promise<CitedTable>;
};

export const REGISTERS: Record<RegisterKey, RegisterDefinition> = {
  risks: {
    title: 'Risk register',
    fileName: 'risk-register.csv',
    resource: 'risk',
    build: buildRiskRegisterCsv,
  },
  'risk-acceptances': {
    title: 'Risk acceptances',
    fileName: 'risk-acceptances.csv',
    resource: 'risk',
    build: buildRiskAcceptancesCsv,
  },
  vendors: {
    title: 'Vendor register',
    fileName: 'vendor-register.csv',
    resource: 'vendor',
    build: buildVendorRegisterCsv,
  },
  people: {
    title: 'People population',
    fileName: 'people.csv',
    resource: 'member',
    build: buildPeopleRegisterCsv,
  },
  devices: {
    title: 'Device inventory',
    fileName: 'devices.csv',
    resource: 'member',
    build: buildDeviceRegisterCsv,
  },
  offboarding: {
    title: 'Offboarding records',
    fileName: 'offboarding-records.csv',
    resource: 'member',
    build: buildOffboardingRegisterCsv,
  },
  findings: {
    title: 'Nonconformities and findings',
    fileName: 'findings.csv',
    resource: 'finding',
    build: buildFindingsRegisterCsv,
    cited: loadFindingsTable,
  },
  assets: {
    title: 'Asset inventory',
    fileName: 'asset-inventory.csv',
    resource: 'integration',
    build: buildAssetRegisterCsv,
  },
  vulnerabilities: {
    title: 'Vulnerabilities',
    fileName: 'vulnerabilities.csv',
    resource: 'integration',
    build: buildVulnerabilityRegisterCsv,
  },
  'access-reviews': {
    title: 'User access reviews',
    fileName: 'access-reviews.csv',
    resource: 'member',
    build: buildAccessReviewsCsv,
  },
  'privileged-users': {
    title: 'Privileged users',
    fileName: 'privileged-users.csv',
    resource: 'member',
    build: buildPrivilegedUsersCsv,
  },
  'access-roles': {
    title: 'Approved access roles',
    fileName: 'access-roles.csv',
    resource: 'member',
    build: buildAccessRolesCsv,
  },
  'training-records': {
    title: 'Training records',
    fileName: 'training-records.csv',
    resource: 'training',
    build: buildTrainingRecordsCsv,
    cited: loadTrainingRecordsTable,
  },
  'vendor-reviews': {
    title: 'Vendor reviews',
    fileName: 'vendor-reviews.csv',
    resource: 'vendor',
    build: buildVendorReviewsCsv,
  },
  'risk-reviews': {
    title: 'Risk reviews',
    fileName: 'risk-reviews.csv',
    resource: 'risk',
    build: buildRiskReviewsCsv,
  },
  'risk-treatment-actions': {
    title: 'Risk treatment actions',
    fileName: 'risk-treatment-actions.csv',
    resource: 'risk',
    build: buildRiskTreatmentActionsCsv,
  },
  'policy-acknowledgements': {
    title: 'Policy acknowledgements',
    fileName: 'policy-acknowledgements.csv',
    resource: 'policy',
    // One row per person per in-force policy, signed or not.
    build: async (params) => (await exportAcknowledgementsCsv(params)).csv,
  },
};

/** `risk-register-2026-11-18.csv` */
export function datedFileName(key: RegisterKey): string {
  const base = REGISTERS[key].fileName.replace(/\.csv$/, '');
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
