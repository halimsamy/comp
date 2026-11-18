import type { GRCResource } from '../../../auth/require-permission.decorator';
import { buildAssetRegisterCsv } from './asset-register';
import { buildDeviceRegisterCsv } from './device-register';
import { buildFindingsRegisterCsv } from './findings-register';
import { buildOffboardingRegisterCsv } from './offboarding-register';
import { buildPeopleRegisterCsv } from './people-register';
import type { RegisterParams } from './register-csv';
import { buildRiskAcceptancesCsv, buildRiskRegisterCsv } from './risk-register';
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
    title: 'Audit findings',
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
};

/** `risk-register-2026-11-18.csv` */
export function datedFileName(key: RegisterKey): string {
  const base = REGISTERS[key].fileName.replace(/\.csv$/, '');
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
