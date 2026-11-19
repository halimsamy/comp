import type { GRCResource } from '../../../auth/require-permission.decorator';
import {
  buildAccessReviewsCsv,
  buildAccessRolesCsv,
  buildPrivilegedUsersCsv,
} from './access-register';
import { buildAssetRegisterCsv } from './asset-register';
import { buildDeviceRegisterCsv } from './device-register';
import { buildFindingsRegisterCsv } from './findings-register';
import { buildOffboardingRegisterCsv } from './offboarding-register';
import { buildPeopleRegisterCsv } from './people-register';
import type { RegisterParams } from './register-csv';
import { buildTrainingRecordsCsv, buildVendorReviewsCsv } from './records-register';
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
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

export type RegisterDefinition = {
  title: string;
  fileName: string;
  /** The `<resource>:read` permission a caller needs to see this register. */
  resource: GRCResource;
  build: (params: RegisterParams) => Promise<string>;
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
};

/** `risk-register-2026-11-18.csv` */
export function datedFileName(key: RegisterKey): string {
  const base = REGISTERS[key].fileName.replace(/\.csv$/, '');
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
