'use client';

import type { Asset } from '@/hooks/use-assets';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ASSET_TYPE_LABELS,
  CDE_SCOPE_LABELS,
  CLASSIFICATION_LABELS,
  ENVIRONMENT_LABELS,
  cdeBadgeVariant,
} from '../lib/asset-labels';

/** Inventory rows; clicking a name opens the asset. */
export function AssetsTable({
  assets,
  onOpen,
}: {
  assets: Asset[];
  onOpen: (asset: Asset) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>PCI scope</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Vulnerabilities</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onOpen(asset)}
                  className="min-w-40 max-w-xs rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="whitespace-normal break-words">
                    <Text size="sm" weight="medium">
                      {asset.name}
                    </Text>
                  </div>
                  <div className="truncate">
                    <Text size="xs" variant="muted">
                      {asset.source === 'manual'
                        ? 'Added manually'
                        : `${asset.providerSlug ?? 'Device'} · ${asset.externalId}`}
                    </Text>
                  </div>
                </button>
              </TableCell>
              <TableCell>
                <Text size="sm">{ASSET_TYPE_LABELS[asset.type]}</Text>
              </TableCell>
              <TableCell>
                <Text size="sm" variant={asset.environment === 'unknown' ? 'muted' : 'default'}>
                  {ENVIRONMENT_LABELS[asset.environment]}
                </Text>
              </TableCell>
              <TableCell>
                <Badge variant={cdeBadgeVariant(asset.cdeScope)}>
                  {CDE_SCOPE_LABELS[asset.cdeScope]}
                </Badge>
              </TableCell>
              <TableCell>
                <Text
                  size="sm"
                  variant={asset.dataClassification === 'unclassified' ? 'muted' : 'default'}
                >
                  {CLASSIFICATION_LABELS[asset.dataClassification]}
                </Text>
              </TableCell>
              <TableCell>
                {asset.owner ? (
                  <Text size="sm">{asset.owner.name || asset.owner.email}</Text>
                ) : (
                  <Text size="sm" variant="warning">
                    No owner
                  </Text>
                )}
              </TableCell>
              <TableCell>
                {asset.openVulnerabilities > 0 ? (
                  <Badge variant="destructive">{asset.openVulnerabilities} open</Badge>
                ) : (
                  <Text size="sm" variant="muted">
                    None
                  </Text>
                )}
              </TableCell>
              <TableCell>
                <div className="whitespace-nowrap">
                  <Text size="sm" variant="muted">
                    {asset.source === 'manual'
                      ? '—'
                      : `${formatDistanceToNowStrict(new Date(asset.lastSeenAt))} ago`}
                  </Text>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
