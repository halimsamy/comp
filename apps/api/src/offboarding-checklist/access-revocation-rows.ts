import { AttachmentEntityType, db } from '@db';
import type { AttachmentsService } from '../attachments/attachments.service';

const SYSTEM_KEY = /^(compai|connection:[\w-]+|manual:[\w-]+|vendor:[\w-]+)$/;

/** Accepts a system key, or a bare vendor id from older clients. */
export function revocationKey(value: string): string {
  return SYSTEM_KEY.test(value) ? value : `vendor:${value}`;
}

export interface RevocationEvidence {
  id: string;
  name: string;
  type: string;
  downloadUrl: string;
  createdAt: Date;
}

export interface RevocationRow {
  systemKey: string;
  name: string;
  kind: 'inventory' | 'vendor';
  logoUrl: string | null;
  vendorId: string | null;
  /** Vendor fallback rows are optional: they don't hold the checklist item open. */
  optional: boolean;
  accounts: { accountId: string; name: string; status: string; roles: string[] }[];
  activeAccounts: number;
  revoked: boolean;
  /** Marked revoked, but the inventory still shows an active account. */
  stillActive: boolean;
  revokedAt: Date | null;
  revokedBy: { id: string; name: string | null; email: string } | null;
  notes: string | null;
  evidence: RevocationEvidence[];
}

interface MemberAccount {
  accountId: string;
  name: string;
  status: string;
  roles: string[];
  system: { key: string; name: string; logoUrl: string | null };
}

interface Revocation {
  id: string;
  systemKey: string;
  systemName: string | null;
  vendorId: string | null;
  revokedAt: Date;
  notes: string | null;
  revokedBy: { id: string; name: string | null; email: string } | null;
}

const vendorLogo = (vendor: { website: string | null; logoUrl: string | null }) => {
  const domain = vendor.website?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') ?? null;
  return vendor.logoUrl ?? (domain ? `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=64` : null);
};

const norm = (name: string) => name.split('(')[0].trim().toLowerCase();

/** Inventory systems where the member has accounts, then vendors no inventory system covers. */
export function buildRevocationRows({
  accounts,
  inventoryNames,
  vendors,
  revocations,
  evidence,
}: {
  accounts: MemberAccount[];
  /** Every inventory system, including ones the member has no account in. */
  inventoryNames: string[];
  vendors: { id: string; name: string; website: string | null; logoUrl: string | null }[];
  revocations: Revocation[];
  evidence: Map<string, RevocationEvidence[]>;
}): RevocationRow[] {
  const byKey = new Map(revocations.map((r) => [r.systemKey, r]));
  const revocationFields = (key: string) => {
    const r = byKey.get(key);
    return {
      revoked: !!r,
      revokedAt: r?.revokedAt ?? null,
      revokedBy: r?.revokedBy ?? null,
      notes: r?.notes ?? null,
      evidence: r ? (evidence.get(r.id) ?? []) : [],
    };
  };
  const systems = new Map<string, RevocationRow>();
  for (const a of accounts) {
    const row =
      systems.get(a.system.key) ??
      ({
        systemKey: a.system.key,
        name: a.system.name,
        kind: 'inventory',
        logoUrl: a.system.logoUrl,
        vendorId: null,
        optional: false,
        accounts: [],
        activeAccounts: 0,
        stillActive: false,
        ...revocationFields(a.system.key),
      } satisfies RevocationRow);
    row.accounts.push({ accountId: a.accountId, name: a.name, status: a.status, roles: a.roles });
    if (a.status === 'active') row.activeAccounts++;
    row.stillActive = row.revoked && row.activeAccounts > 0;
    systems.set(a.system.key, row);
  }
  // Revocations of systems the member no longer appears in stay visible as evidence.
  for (const r of revocations) {
    if (systems.has(r.systemKey) || r.systemKey.startsWith('vendor:')) continue;
    systems.set(r.systemKey, {
      systemKey: r.systemKey,
      name: r.systemName ?? r.systemKey,
      kind: 'inventory',
      logoUrl: null,
      vendorId: null,
      optional: false,
      accounts: [],
      activeAccounts: 0,
      stillActive: false,
      ...revocationFields(r.systemKey),
    });
  }
  const covered = [...inventoryNames, ...[...systems.values()].map((s) => s.name)]
    .map(norm)
    .filter(Boolean);
  const vendorRows: RevocationRow[] = vendors
    .filter((v) => {
      const vendor = norm(v.name);
      return !vendor || !covered.some((name) => name.includes(vendor) || vendor.includes(name));
    })
    .map((v) => ({
      systemKey: `vendor:${v.id}`,
      name: v.name,
      kind: 'vendor',
      logoUrl: vendorLogo(v),
      vendorId: v.id,
      optional: true,
      accounts: [],
      activeAccounts: 0,
      stillActive: false,
      ...revocationFields(`vendor:${v.id}`),
    }));
  return [...systems.values(), ...vendorRows];
}

/** Proof files attached to revocations, with download links. */
export async function loadRevocationEvidence({
  organizationId,
  revocationIds,
  attachments,
}: {
  organizationId: string;
  revocationIds: string[];
  attachments: AttachmentsService;
}) {
  const byRevocation = new Map<string, RevocationEvidence[]>();
  if (revocationIds.length === 0) return byRevocation;
  const rows = await db.attachment.findMany({
    where: {
      organizationId,
      entityId: { in: revocationIds },
      entityType: AttachmentEntityType.offboarding_checklist,
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const a of rows) {
    const list = byRevocation.get(a.entityId) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      type: a.type,
      downloadUrl: await attachments.getPresignedDownloadUrl(a.url),
      createdAt: a.createdAt,
    });
    byRevocation.set(a.entityId, list);
  }
  return byRevocation;
}
