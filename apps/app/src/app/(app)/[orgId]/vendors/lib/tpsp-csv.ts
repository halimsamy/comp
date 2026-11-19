import { parseCsvRows } from '@/app/(app)/[orgId]/people/access/lib/accounts-csv';
import type { BulkVendorUpdate } from '@/hooks/use-vendor-register';
import type { Vendor } from '@/hooks/use-vendors';

type Field = Exclude<keyof BulkVendorUpdate, 'id' | 'assigneeId'>;
type Kind = 'boolean' | 'date' | 'criticality' | 'pciStatus' | 'assuranceType';

/** Recognized headers (lowercase, letters only) → TPSP field. */
const COLUMNS: Record<string, { field: Field; kind: Kind }> = {
  criticality: { field: 'criticality', kind: 'criticality' },
  tier: { field: 'criticality', kind: 'criticality' },
  handlescardholderdata: { field: 'handlesCardholderData', kind: 'boolean' },
  cardholderdata: { field: 'handlesCardholderData', kind: 'boolean' },
  accountdata: { field: 'handlesCardholderData', kind: 'boolean' },
  sharesaccountdata: { field: 'handlesCardholderData', kind: 'boolean' },
  affectscde: { field: 'affectsCdeSecurity', kind: 'boolean' },
  affectscdesecurity: { field: 'affectsCdeSecurity', kind: 'boolean' },
  contractstart: { field: 'contractStartDate', kind: 'date' },
  contractstartdate: { field: 'contractStartDate', kind: 'date' },
  contractend: { field: 'contractEndDate', kind: 'date' },
  contractenddate: { field: 'contractEndDate', kind: 'date' },
  securityclauses: { field: 'securityClausesConfirmed', kind: 'boolean' },
  confidentialityclauses: { field: 'confidentialityClausesConfirmed', kind: 'boolean' },
  tpspacknowledgement: { field: 'tpspAcknowledgementDate', kind: 'date' },
  tpspacknowledgementdate: { field: 'tpspAcknowledgementDate', kind: 'date' },
  acknowledgementdate: { field: 'tpspAcknowledgementDate', kind: 'date' },
  assurancetype: { field: 'assuranceType', kind: 'assuranceType' },
  assuranceexpires: { field: 'assuranceExpiresAt', kind: 'date' },
  assuranceexpiry: { field: 'assuranceExpiresAt', kind: 'date' },
  pcistatus: { field: 'pciStatus', kind: 'pciStatus' },
  pcistatuschecked: { field: 'pciStatusCheckedAt', kind: 'date' },
  pcistatuscheckedat: { field: 'pciStatusCheckedAt', kind: 'date' },
  lastpcicheck: { field: 'pciStatusCheckedAt', kind: 'date' },
};
const NAME_HEADERS = new Set(['name', 'vendor', 'vendorname', 'supplier', 'tpsp']);

const ENUMS: Record<'criticality' | 'pciStatus' | 'assuranceType', string[]> = {
  criticality: ['critical', 'high', 'medium', 'low'],
  pciStatus: ['compliant', 'non_compliant', 'in_progress', 'not_applicable', 'unknown'],
  assuranceType: ['soc2_type1', 'soc2_type2', 'iso27001', 'pci_aoc', 'pci_roc', 'other', 'none'],
};

const key = (header: string) => header.toLowerCase().replace(/[^a-z]/g, '');
const slug = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** One cell → API value, or undefined when blank or not understood. */
function parseValue(kind: Kind, raw: string): string | boolean | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (kind === 'boolean') {
    if (/^(yes|true|1|y)$/i.test(value)) return true;
    if (/^(no|false|0|n)$/i.test(value)) return false;
    return undefined;
  }
  if (kind === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const normalized = slug(value);
  return ENUMS[kind].includes(normalized) ? normalized : undefined;
}

export interface TpspImportChange {
  field: Field;
  from: unknown;
  to: string | boolean;
}

export interface TpspImportPreview {
  matched: { vendor: Pick<Vendor, 'id' | 'name'>; changes: TpspImportChange[] }[];
  unmatched: string[];
  error: string | null;
}

/** Comparable form of a stored value (dates to their day). */
const comparable = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;

/**
 * Matches CSV rows to vendors by name (case-insensitive) and lists the TPSP
 * fields that would change. Only recognized, non-empty cells count.
 */
export function previewTpspImport({
  text,
  vendors,
}: {
  text: string;
  vendors: Vendor[];
}): TpspImportPreview {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) return { matched: [], unmatched: [], error: 'The file is empty.' };
  const keys = header.map(key);
  const nameIndex = keys.findIndex((k) => NAME_HEADERS.has(k));
  if (nameIndex < 0) return { matched: [], unmatched: [], error: 'Add a "name" or "vendor" column.' };
  if (!keys.some((k) => COLUMNS[k])) {
    return { matched: [], unmatched: [], error: 'No TPSP columns recognized (e.g. criticality, contract end, PCI status).' };
  }

  const byName = new Map(vendors.map((v) => [v.name.trim().toLowerCase(), v]));
  const preview: TpspImportPreview = { matched: [], unmatched: [], error: null };
  for (const row of rows) {
    const name = row[nameIndex]?.trim();
    if (!name) continue;
    const vendor = byName.get(name.toLowerCase());
    if (!vendor) {
      preview.unmatched.push(name);
      continue;
    }
    const changes: TpspImportChange[] = [];
    keys.forEach((k, index) => {
      const column = COLUMNS[k];
      if (!column) return;
      const to = parseValue(column.kind, row[index] ?? '');
      const from = vendor[column.field];
      if (to === undefined || comparable(from) === comparable(to)) return;
      changes.push({ field: column.field, from: from ?? null, to });
    });
    if (changes.length) preview.matched.push({ vendor: { id: vendor.id, name: vendor.name }, changes });
  }
  return preview;
}

export function previewToUpdates(preview: TpspImportPreview): BulkVendorUpdate[] {
  return preview.matched.map(({ vendor, changes }) => ({
    id: vendor.id,
    ...Object.fromEntries(changes.map((c) => [c.field, c.to])),
  }));
}
