import type { Asset } from '@/hooks/use-assets';

export function makeAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    name: 'payments-prod-db',
    type: 'database',
    source: 'integration',
    providerSlug: 'aws',
    externalId: 'arn:aws:rds:eu-west-1:1:db:payments-prod-db',
    resourceType: 'aws-rds-instance',
    environment: 'production',
    cdeScope: 'in_scope',
    dataClassification: 'restricted',
    ownerId: 'mem_1',
    owner: { id: 'mem_1', name: 'Ada', email: 'ada@x.com' },
    description: null,
    firstSeenAt: '2026-11-01T00:00:00.000Z',
    lastSeenAt: '2026-11-18T00:00:00.000Z',
    archivedAt: null,
    openVulnerabilities: 2,
    ...over,
  };
}

export const ASSETS: Asset[] = [
  makeAsset(),
  makeAsset({
    id: 'ast_2',
    name: 'acme/web',
    type: 'repository',
    providerSlug: 'github',
    externalId: 'acme/web',
    environment: 'unknown',
    cdeScope: 'unassessed',
    dataClassification: 'unclassified',
    ownerId: null,
    owner: null,
    openVulnerabilities: 0,
  }),
  makeAsset({
    id: 'ast_3',
    name: 'Office firewall',
    type: 'network',
    source: 'manual',
    providerSlug: null,
    externalId: 'uuid',
    cdeScope: 'connected',
    openVulnerabilities: 0,
  }),
];
