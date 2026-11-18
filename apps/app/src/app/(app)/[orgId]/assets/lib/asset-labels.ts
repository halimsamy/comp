import type {
  AssetCdeScope,
  AssetDataClassification,
  AssetEnvironment,
  AssetSource,
  AssetType,
} from '@/hooks/use-assets';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  computer: 'Computers',
  compute: 'Compute instances',
  container: 'Containers & clusters',
  serverless: 'Serverless functions',
  database: 'Databases',
  storage: 'Storage',
  network: 'Network & edge',
  repository: 'Code repositories',
  key_secret: 'Keys & secrets',
  messaging: 'Queues & streams',
  cloud_account: 'Cloud accounts',
  application: 'Applications',
  other: 'Other',
};

export const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];

export const ENVIRONMENT_LABELS: Record<AssetEnvironment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  test: 'Test',
  unknown: 'Not set',
};

export const CDE_SCOPE_LABELS: Record<AssetCdeScope, string> = {
  in_scope: 'In CDE',
  connected: 'Connected to CDE',
  out_of_scope: 'Out of scope',
  unassessed: 'Not assessed',
};

export const CDE_SCOPE_HELP: Record<AssetCdeScope, string> = {
  in_scope: 'Stores, processes or transmits cardholder data',
  connected: 'Can affect the security of the CDE',
  out_of_scope: 'Segmented from the CDE',
  unassessed: 'Scope not decided yet',
};

export const CLASSIFICATION_LABELS: Record<AssetDataClassification, string> = {
  unclassified: 'Unclassified',
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

export const SOURCE_LABELS: Record<AssetSource, string> = {
  integration: 'Integration',
  device: 'Device agent / MDM',
  manual: 'Added manually',
};

export function cdeBadgeVariant(
  scope: AssetCdeScope,
): 'destructive' | 'accent' | 'outline' | 'secondary' {
  if (scope === 'in_scope') return 'destructive';
  if (scope === 'connected') return 'accent';
  if (scope === 'unassessed') return 'outline';
  return 'secondary';
}
