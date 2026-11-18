import { db } from '@db';
import {
  humanize,
  personName,
  toCsv,
  type RegisterParams,
} from './register-csv';

/** System inventory with owner and CDE scope (ISO 27001 A.5.9, A.8.1; PCI DSS 12.5.1, 12.5.2). */
export async function buildAssetRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const assets = await db.asset.findMany({
    where: { organizationId, archivedAt: null },
    include: {
      owner: { select: { user: { select: { name: true, email: true } } } },
      _count: { select: { vulnerabilities: { where: { status: 'open' } } } },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return toCsv({
    headers: [
      'Asset ID',
      'Name',
      'Type',
      'Identifier',
      'Source',
      'Provider',
      'Environment',
      'PCI CDE scope',
      'Data classification',
      'Owner',
      'Owner email',
      'Description',
      'Open vulnerabilities',
      'First seen',
      'Last seen',
    ],
    rows: assets.map((a) => [
      a.id,
      a.name,
      humanize(a.type),
      a.source === 'manual' ? '' : a.externalId,
      humanize(a.source),
      a.providerSlug,
      humanize(a.environment),
      humanize(a.cdeScope),
      humanize(a.dataClassification),
      personName(a.owner?.user),
      a.owner?.user.email,
      a.description,
      a._count.vulnerabilities,
      a.firstSeenAt,
      a.lastSeenAt,
    ]),
  });
}
