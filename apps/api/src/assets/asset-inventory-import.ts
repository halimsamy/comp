import type { AssetEnvironment, AssetType } from '@db';
import { z } from 'zod';
import { classifyAssetName, classifyEnvironment } from './asset-classify';
import { columnIndex, parseCsv } from './vulnerability-import';

/** One inventory line from the Infrastructure Inventory form or a CSV, before matching. */
export interface InventoryRow {
  /** Stable externalId so a re-import updates instead of duplicating. */
  key: string;
  name: string;
  description: string | null;
  type: string | null;
  environment: string | null;
  location: string | null;
  owner: string | null;
  vendor: string | null;
  version: string | null;
  endOfSupport: string | null;
  lastReviewed: string | null;
}

export interface AssetDraft {
  externalId: string;
  name: string;
  description: string | null;
  type: AssetType;
  environment: AssetEnvironment;
  location: string | null;
  ownerId: string | null;
  vendorId: string | null;
  version: string | null;
  endOfSupportAt: Date | null;
  lastReviewedAt: Date | null;
}

export interface MemberRef {
  id: string;
  name: string | null;
  email: string;
}

export interface VendorRef {
  id: string;
  name: string;
}

const formRowSchema = z.object({
  assetId: z.string().trim().min(1),
  systemType: z.string().trim().min(1),
  environment: z.string().optional(),
  location: z.string().optional(),
  assignedOwner: z.string().optional(),
  lastReviewed: z.string().optional(),
});
const formSchema = z.object({ inventoryRows: z.array(z.unknown()) });

const clean = (v: string | undefined | null) => v?.trim() || null;

/** "ECS Fargate service x: public API" → "ECS Fargate service x". */
export function nameFromSystemType(systemType: string): string {
  const name = systemType.split(/[:(]/)[0].trim();
  return (name || systemType.trim()).slice(0, 200);
}

/** Rows of an `infrastructure-inventory` submission; malformed rows are skipped. */
export function rowsFromInventoryForm(data: unknown): InventoryRow[] {
  const parsed = formSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.inventoryRows.flatMap((raw) => {
    const row = formRowSchema.safeParse(raw);
    if (!row.success) return [];
    const r = row.data;
    return [
      {
        key: `infra-form:${r.assetId}`,
        name: nameFromSystemType(r.systemType),
        description: r.systemType,
        type: null,
        environment: clean(r.environment),
        location: clean(r.location),
        owner: clean(r.assignedOwner),
        vendor: null,
        version: null,
        endOfSupport: null,
        lastReviewed: clean(r.lastReviewed),
      },
    ];
  });
}

const CSV_COLUMNS = {
  name: ['name', 'asset', 'asset name', 'system', 'hostname', 'system type'],
  description: ['description', 'function', 'purpose', 'details'],
  type: ['type', 'asset type', 'category'],
  environment: ['environment', 'env'],
  location: ['location', 'region', 'hosting', 'data center'],
  owner: ['owner', 'assigned owner', 'owner email', 'asset owner'],
  vendor: ['vendor', 'provider', 'supplier'],
  version: ['version', 'os version', 'software version'],
  endOfSupport: ['end of support', 'end of life', 'eol', 'end-of-life'],
  lastReviewed: ['last reviewed', 'reviewed', 'last review'],
} as const;

/** Rows of an inventory CSV (header row required, a name column mandatory). */
export function rowsFromCsv(csv: string): InventoryRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const index = columnIndex<keyof typeof CSV_COLUMNS>({
    header,
    aliases: CSV_COLUMNS,
  });
  if (index.name < 0) {
    throw new Error('The CSV needs a name column (name, asset or system).');
  }
  return rows.flatMap((row) => {
    const cell = (col: keyof typeof CSV_COLUMNS) =>
      index[col] >= 0 ? clean(row[index[col]]) : null;
    const full = cell('name');
    if (!full) return [];
    return [
      {
        key: `csv:${full.toLowerCase().slice(0, 200)}`,
        name: nameFromSystemType(full),
        description: cell('description') ?? (full.length > 200 ? full : null),
        type: cell('type'),
        environment: cell('environment'),
        location: cell('location'),
        owner: cell('owner'),
        vendor: cell('vendor'),
        version: cell('version'),
        endOfSupport: cell('endOfSupport'),
        lastReviewed: cell('lastReviewed'),
      },
    ];
  });
}

/** Member whose full name or email appears in the owner text ("Engineering - Jane Doe"). */
export function matchMember(
  text: string | null,
  members: MemberRef[],
): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  const hits = members
    .map((m) => {
      const name = m.name?.trim().toLowerCase() ?? '';
      if (haystack.includes(m.email.toLowerCase())) return { m, score: 1000 };
      return name.length >= 3 && haystack.includes(name)
        ? { m, score: name.length }
        : null;
    })
    .filter((hit): hit is { m: MemberRef; score: number } => hit !== null)
    .sort((a, b) => b.score - a.score);
  return hits[0]?.m.id ?? null;
}

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Name, the part in brackets, and the acronym of 3+ word names ("Amazon Web Services" → "AWS"). */
function vendorAliases(name: string): Array<{ alias: string; exact: boolean }> {
  const bracket = name.match(/\(([^)]+)\)/)?.[1]?.trim();
  const bare = name.replace(/\([^)]*\)/g, '').trim();
  const words = bare.split(/\s+/).filter(Boolean);
  const aliases = [name, bare, bracket]
    .filter((a): a is string => !!a && a.length >= 3)
    .map((alias) => ({ alias, exact: false }));
  if (words.length >= 3) {
    aliases.push({
      alias: words.map((w) => w[0].toUpperCase()).join(''),
      exact: true,
    });
  }
  return aliases;
}

/** Vendor named in the given texts (first text wins), longest alias first. */
export function matchVendor(
  texts: Array<string | null>,
  vendors: VendorRef[],
): string | null {
  const aliases = vendors
    .flatMap((v) => vendorAliases(v.name).map((a) => ({ ...a, id: v.id })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const text of texts) {
    if (!text) continue;
    const hit = aliases.find(({ alias, exact }) =>
      new RegExp(
        `(^|[^A-Za-z0-9])${escape(alias)}([^A-Za-z0-9]|$)`,
        exact ? '' : 'i',
      ).test(text),
    );
    if (hit) return hit.id;
  }
  return null;
}

const ASSET_TYPES: AssetType[] = [
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
];

function parseDay(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toAssetDraft({
  row,
  members,
  vendors,
}: {
  row: InventoryRow;
  members: MemberRef[];
  vendors: VendorRef[];
}): AssetDraft {
  const typed = row.type?.toLowerCase().replace(/[\s/-]+/g, '_');
  const type =
    ASSET_TYPES.find((t) => t === typed) ?? classifyAssetName(row.name);
  return {
    externalId: row.key,
    name: row.name,
    description: row.description,
    type,
    environment: row.environment
      ? classifyEnvironment(row.environment)
      : 'unknown',
    location: row.location,
    ownerId: matchMember(row.owner, members),
    vendorId: matchVendor(
      [row.vendor, row.location, row.description ?? row.name],
      vendors,
    ),
    version: row.version,
    endOfSupportAt: parseDay(row.endOfSupport),
    lastReviewedAt: parseDay(row.lastReviewed),
  };
}
