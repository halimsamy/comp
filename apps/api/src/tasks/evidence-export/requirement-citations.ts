import type { FrameworkFamily } from './native-artifact-control-map';
import { toCsv, type CitedTable } from './registers/register-csv';

/** `pci:10.6.2`, `iso27001:A.8.15`: a requirement within its framework family. */
export function citationKey({
  family,
  identifier,
}: {
  family: FrameworkFamily;
  identifier: string;
}): string {
  return `${family}:${identifier.trim()}`;
}

// ISO Annex A (A.8.15), PCI appendix (A1.2.1) or dotted clause (6.1.3, 10.2.1.1).
const ID = String.raw`A\.\d+\.\d+|A\d(?:\.\d+)+|\d+(?:\.\d+)+`;
const ID_OR_RANGE = new RegExp(`(${ID})(?:\\s*-\\s*(${ID}))?`, 'g');

/** "10.2.1.1-10.2.1.7" → each sibling in between; anything else → its end points. */
function expandRange(from: string, to: string | undefined): string[] {
  if (!to) return [from];
  const a = from.split('.');
  const b = to.split('.');
  const [first, last] = [Number(a.at(-1)), Number(b.at(-1))];
  if (a.length !== b.length || a.slice(0, -1).join('.') !== b.slice(0, -1).join('.') || last < first) {
    return [from, to];
  }
  const prefix = a.slice(0, -1).join('.');
  return Array.from({ length: last - first + 1 }, (_, i) => `${prefix}.${first + i}`);
}

/**
 * Requirement keys named by a reference such as
 * "PCI DSS 6.3.1, 6.3.2; 11.3.1; ISO 27001 A.8.8". A `;` segment without a
 * framework name continues the previous one; a segment naming another
 * standard ("Egyptian PDPL 151/2020") cites nothing.
 */
export function parseRequirementCitations(reference: string | null | undefined): string[] {
  const keys = new Set<string>();
  let family: FrameworkFamily | null = null;
  for (const raw of (reference ?? '').split(';')) {
    // Drop version tokens ("v4.0.1", "27001:2022") so they are not read as requirements.
    const segment = raw.replace(/\bv\d+(?:\.\d+)*/gi, '').replace(/27001(?::\d{4})?/g, '');
    if (/\bPCI\b/i.test(segment)) family = 'pci';
    else if (/\bISO\b/i.test(segment)) family = 'iso27001';
    else if (/[a-z]{2,}/i.test(segment.replace(new RegExp(ID, 'g'), ''))) family = null;
    if (!family) continue;
    for (const match of segment.matchAll(ID_OR_RANGE)) {
      for (const identifier of expandRange(match[1], match[2])) {
        // "A.8.10" is ISO Annex A whatever segment it sits in.
        const own = identifier.startsWith('A.') ? 'iso27001' : family;
        keys.add(citationKey({ family: own, identifier }));
      }
    }
  }
  return [...keys];
}

/** The citation prefix of a finding: "PCI DSS 10.3.4; ISO 27001 A.8.15: No alert…". */
export function citationPrefix(text: string | null | undefined): string {
  const end = (text ?? '').indexOf(': ');
  return end > 0 ? (text ?? '').slice(0, end) : '';
}

export type CitedRows = {
  headers: string[];
  rows: Array<{ cells: CitedTable['rows'][number]; keys: string[] }>;
};

export function toCitedRows(table: CitedTable): CitedRows {
  return {
    headers: table.headers,
    rows: table.rows.map((cells, i) => ({
      cells,
      keys: parseRequirementCitations(table.cites[i]),
    })),
  };
}

/** The register rows citing one requirement as a CSV, or null when none do. */
export function citingCsv({
  cited,
  key,
}: {
  cited: CitedRows;
  key: string;
}): { csv: string; count: number } | null {
  const rows = cited.rows.filter((row) => row.keys.includes(key));
  if (rows.length === 0) return null;
  return {
    csv: toCsv({ headers: cited.headers, rows: rows.map((row) => row.cells) }),
    count: rows.length,
  };
}
