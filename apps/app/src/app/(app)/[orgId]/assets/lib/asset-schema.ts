import type { Asset, AssetPayload } from '@/hooks/use-assets';
import { z } from 'zod';

export const assetSchema = z
  .object({
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
    dataClassification: z.enum([
      'unclassified',
      'public',
      'internal',
      'confidential',
      'restricted',
    ]),
    ownerId: z.string(),
    description: z.string().max(2000),
    scopeJustification: z.string().max(2000),
    location: z.string().max(500),
    vendorId: z.string(),
    version: z.string().max(200),
    endOfSupportAt: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date'),
  })
  .refine((v) => v.cdeScope !== 'out_of_scope' || v.scopeJustification.trim().length > 0, {
    message: 'Explain why the asset is out of PCI DSS scope',
    path: ['scopeJustification'],
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
    scopeJustification: asset?.scopeJustification ?? '',
    location: asset?.location ?? '',
    vendorId: asset?.vendorId ?? '',
    version: asset?.version ?? '',
    endOfSupportAt: asset?.endOfSupportAt?.slice(0, 10) ?? '',
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
    scopeJustification:
      values.cdeScope === 'out_of_scope' ? values.scopeJustification.trim() || null : null,
    location: values.location.trim() || null,
    vendorId: values.vendorId || null,
    version: values.version.trim() || null,
    endOfSupportAt: values.endOfSupportAt || null,
  };
  if (asset && asset.source !== 'manual') return editable;
  return { ...editable, name: values.name.trim(), type: values.type };
}
