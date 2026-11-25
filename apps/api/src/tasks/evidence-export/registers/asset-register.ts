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
      vendor: { select: { name: true } },
      _count: { select: { vulnerabilities: { where: { status: 'open' } } } },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  // lastReviewedById is a plain member id (no relation), so resolve names in one query.
  const reviewerIds = [
    ...new Set(assets.map((a) => a.lastReviewedById).filter((id): id is string => !!id)),
  ];
  const reviewers = reviewerIds.length
    ? await db.member.findMany({
        where: { organizationId, id: { in: reviewerIds } },
        select: { id: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const reviewerName = new Map(reviewers.map((m) => [m.id, personName(m.user)]));

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
      'Version',
      // PCI DSS 6.3.3, 12.3.4
      'End of support',
      'Location',
      'Vendor',
      'Scope justification',
      // PCI DSS 12.5.1, 12.5.2: annual inventory and scope confirmation.
      'Last reviewed',
      'Last reviewed by',
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
      a.version,
      a.endOfSupportAt,
      a.location,
      a.vendor?.name,
      a.scopeJustification,
      a.lastReviewedAt,
      a.lastReviewedById ? reviewerName.get(a.lastReviewedById) : null,
      a._count.vulnerabilities,
      a.firstSeenAt,
      a.lastSeenAt,
    ]),
  });
}
