import type { Asset, AssetPayload } from '@/hooks/use-assets';
import { z } from 'zod';

export const assetSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.enum([
    'computer',
    'compute',
    'container',
    'serverless',
    'database',
    'storage',
    'network',
    'repository',
    'key_secret',
    'messaging',
    'cloud_account',
    'application',
    'other',
  ]),
  environment: z.enum(['production', 'staging', 'development', 'test', 'unknown']),
  cdeScope: z.enum(['unassessed', 'in_scope', 'connected', 'out_of_scope']),
  dataClassification: z.enum(['unclassified', 'public', 'internal', 'confidential', 'restricted']),
  ownerId: z.string(),
  description: z.string().max(2000),
});

export type AssetFormValues = z.infer<typeof assetSchema>;

export function toAssetFormValues(asset: Asset | null): AssetFormValues {
  return {
    name: asset?.name ?? '',
    type: asset?.type ?? 'other',
    environment: asset?.environment ?? 'unknown',
    cdeScope: asset?.cdeScope ?? 'unassessed',
    dataClassification: asset?.dataClassification ?? 'unclassified',
    ownerId: asset?.ownerId ?? '',
    description: asset?.description ?? '',
  };
}

/** Synced assets keep the name and type their source reports. */
export function toAssetPayload({
  values,
  asset,
}: {
  values: AssetFormValues;
  asset: Asset | null;
}): AssetPayload {
  const editable = {
    environment: values.environment,
    cdeScope: values.cdeScope,
    dataClassification: values.dataClassification,
    ownerId: values.ownerId || null,
    description: values.description.trim() || null,
  };
  if (asset && asset.source !== 'manual') return editable;
  return { ...editable, name: values.name.trim(), type: values.type };
}
