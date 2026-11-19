import { db, type VulnerabilityScanKind } from '@db';
import { reviewStatus } from '../../../assets/asset-review';
import { DAY_MS } from '../../../assets/vulnerability-sla';
import {
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  type NativeEvidenceRule,
} from '../native-evidence.types';

const SCOPE_LABEL = {
  unassessed: 'Not assessed',
  in_scope: 'In CDE',
  connected: 'Connected',
  out_of_scope: 'Out of scope',
} as const;

async function loadInventory(organizationId: string) {
  const [assets, review] = await Promise.all([
    db.asset.findMany({
      where: { organizationId, archivedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        environment: true,
        cdeScope: true,
        ownerId: true,
        owner: { select: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    reviewStatus(organizationId),
  ]);
  return { assets, review };
}

function inventoryRule({ scopeOnly }: { scopeOnly: boolean }): NativeEvidenceRule {
  return {
    key: scopeOnly ? 'assets_cde_scope' : 'assets_inventory',
    module: 'Assets',
    title: scopeOnly
      ? 'Every asset has an assessed PCI scope and the scope was confirmed in the last 12 months'
      : 'Every asset has an owner and an assessed scope, and the inventory was reviewed in the last 12 months',
    reference: scopeOnly
      ? 'PCI DSS v4.0.1 12.5.2, 12.5.1; ISO/IEC 27001:2022 4.3'
      : 'ISO/IEC 27001:2022 A.5.9, A.5.10; PCI DSS v4.0.1 12.5.1, 2.4.1',
    path: '/assets',
    async evaluate({ organizationId, now }) {
      const { assets, review } = await loadInventory(organizationId);
      const unowned = scopeOnly ? [] : assets.filter((a) => !a.ownerId);
      const unassessed = assets.filter((a) => a.cdeScope === 'unassessed');
      const reviewed = !!review.lastReviewedAt && review.lastReviewedAt >= monthsBefore({ date: now, months: 12 });
      const holds = assets.length > 0 && unowned.length === 0 && unassessed.length === 0 && reviewed;
      const reviewer = review.reviewedBy ? review.reviewedBy.name || review.reviewedBy.email : '—';
      return {
        holds,
        summary: `${assets.length} assets; inventory ${review.lastReviewedAt ? `reviewed ${formatDate(review.lastReviewedAt)}` : 'never reviewed'}`,
        issues: [
          ...(assets.length ? [] : ['Add or import your assets in Assets.']),
          ...(reviewed ? [] : ['Review the inventory in Assets and click “Mark inventory reviewed”.']),
          ...listIssue({ label: 'No owner', names: unowned.map((a) => a.name) }),
          ...listIssue({ label: 'Scope not assessed', names: unassessed.map((a) => a.name) }),
        ],
        fingerprint: fingerprintOf([
          review.lastReviewedAt,
          assets.map((a) => [a.id, a.ownerId, a.cdeScope]),
        ]),
        sections: [
          {
            heading: scopeOnly ? 'Scope confirmation' : 'Inventory review',
            keyValues: [
              { label: 'Assets', value: String(assets.length) },
              { label: 'In or connected to the CDE', value: String(assets.filter((a) => a.cdeScope === 'in_scope' || a.cdeScope === 'connected').length) },
              { label: 'Last reviewed', value: formatDate(review.lastReviewedAt) },
              { label: 'Reviewed by', value: reviewer },
            ],
          },
          {
            heading: 'Asset register',
            emptyText: 'No assets recorded.',
            ...(assets.length > 0 && {
              table: {
                headers: ['Asset', 'Type', 'Environment', 'PCI scope', 'Owner'],
                rows: assets.map((a) => [
                  a.name,
                  a.type,
                  a.environment,
                  SCOPE_LABEL[a.cdeScope],
                  a.owner ? a.owner.user.name || a.owner.user.email : '—',
                ]),
              },
            }),
          },
        ],
      };
    },
  };
}

/** Infrastructure Inventory, Device List: the asset register is the single inventory. */
export const assetInventoryRule = inventoryRule({ scopeOnly: false });
/** Scope confirmation & CDE inventory pack. */
export const cdeScopeRule = inventoryRule({ scopeOnly: true });

const SCAN_LABEL: Record<VulnerabilityScanKind, string> = {
  internal: 'Internal vulnerability scan',
  external_asv: 'ASV external scan',
  pentest: 'Penetration test',
};

function latestScan({
  organizationId,
  kind,
  passingOnly,
}: {
  organizationId: string;
  kind: VulnerabilityScanKind;
  passingOnly: boolean;
}) {
  return db.vulnerabilityScan.findFirst({
    where: { organizationId, kind, ...(passingOnly && { passed: true }) },
    orderBy: { scannedAt: 'desc' },
    select: { id: true, vendor: true, scannedAt: true, passed: true, findingCount: true },
  });
}

/** PCI DSS 11.3.2: a passing ASV scan in the last 90 days. */
export const asvScanRule: NativeEvidenceRule = {
  key: 'vuln_asv_scan',
  module: 'Vulnerabilities',
  title: 'A passing ASV external scan in the last 90 days',
  reference: 'PCI DSS v4.0.1 11.3.2; ISO/IEC 27001:2022 A.8.8',
  path: '/vulnerabilities?tab=scans',
  async evaluate({ organizationId, now }) {
    const scan = await latestScan({ organizationId, kind: 'external_asv', passingOnly: true });
    const holds = !!scan && scan.scannedAt.getTime() >= now.getTime() - 90 * DAY_MS;
    return {
      holds,
      summary: scan ? `Last passing ASV scan ${formatDate(scan.scannedAt)}` : 'No passing ASV scan recorded',
      issues: holds ? [] : ['Record this quarter’s passing ASV scan in Vulnerabilities > Scans.'],
      fingerprint: fingerprintOf(['asv', scan?.id ?? null]),
      sections: [scanSection({ kind: 'external_asv', scan })],
    };
  },
};

function scanSection({
  kind,
  scan,
}: {
  kind: VulnerabilityScanKind;
  scan: Awaited<ReturnType<typeof latestScan>>;
}) {
  return {
    heading: SCAN_LABEL[kind],
    keyValues: [
      { label: 'Scanned on', value: formatDate(scan?.scannedAt) },
      { label: 'Vendor', value: scan?.vendor ?? '—' },
      { label: 'Result', value: scan ? (scan.passed === true ? 'Passed' : scan.passed === false ? 'Failed' : 'No verdict') : '—' },
      { label: 'Findings', value: scan ? String(scan.findingCount) : '—' },
    ],
  };
}

/** PCI DSS 6.3.3, 11.3.1; ISO A.8.8: no critical or high past SLA and an internal scan in 90 days. */
export const vulnerabilityRemediationRule: NativeEvidenceRule = {
  key: 'vuln_remediation',
  module: 'Vulnerabilities',
  title: 'No critical or high vulnerability is past its SLA, and an internal scan ran in the last 90 days',
  reference: 'ISO/IEC 27001:2022 A.8.8; PCI DSS v4.0.1 6.3.1, 6.3.3, 11.3.1',
  path: '/vulnerabilities',
  async evaluate({ organizationId, now }) {
    const [overdue, scan] = await Promise.all([
      db.integrationPlatformFinding.findMany({
        where: {
          organizationId,
          status: 'open',
          severity: { in: ['critical', 'high'] },
          slaDueAt: { lt: now },
        },
        select: { id: true, title: true, severity: true, slaDueAt: true },
        orderBy: { slaDueAt: 'asc' },
      }),
      latestScan({ organizationId, kind: 'internal', passingOnly: false }),
    ]);
    const scanned = !!scan && scan.scannedAt.getTime() >= now.getTime() - 90 * DAY_MS;
    return {
      holds: overdue.length === 0 && scanned,
      summary: `${overdue.length} critical or high past SLA; last internal scan ${formatDate(scan?.scannedAt)}`,
      issues: [
        ...(scanned ? [] : ['Record an internal vulnerability scan from the last 90 days in Vulnerabilities > Scans.']),
        ...listIssue({ label: 'Past SLA', names: overdue.map((f) => f.title) }),
      ],
      fingerprint: fingerprintOf(['vuln', scan?.id ?? null, overdue.map((f) => f.id)]),
      sections: [
        scanSection({ kind: 'internal', scan }),
        {
          heading: 'Critical and high vulnerabilities past SLA',
          emptyText: 'None.',
          ...(overdue.length > 0 && {
            table: {
              headers: ['Vulnerability', 'Severity', 'SLA due'],
              rows: overdue.map((f) => [f.title, f.severity, formatDate(f.slaDueAt)]),
            },
          }),
        },
      ],
    };
  },
};
