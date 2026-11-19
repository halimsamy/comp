/** A stored register row as the upsert sees it (ordered by position). */
export interface ExistingRegisterRow {
  id: string;
  source: 'derived' | 'manual';
  derivedFrom: string | null;
  position: number;
}

/**
 * Keys rows by provenance plus occurrence ("wizard:objective#1"), because a
 * provenance key can repeat (one row per wizard objective). A row edited by a
 * person keeps its derivedFrom and its position, so it keeps its key.
 */
export function keyByProvenance<T extends { derivedFrom: string | null }>(
  rows: T[],
): Array<{ key: string | null; row: T }> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (!row.derivedFrom) return { key: null, row };
    const occurrence = seen.get(row.derivedFrom) ?? 0;
    seen.set(row.derivedFrom, occurrence + 1);
    return { key: `${row.derivedFrom}#${occurrence}`, row };
  });
}

/**
 * Regenerate a register without losing work (#37):
 * - a derived row still produced is updated in place (generated text only, so
 *   owner, last-reviewed date and acknowledgements survive);
 * - a derived row whose slot holds a manual edit (same derivedFrom) is skipped;
 * - new derived rows are appended after the last position;
 * - derived rows the platform no longer produces are deleted.
 */
export async function upsertDerivedRows<T extends { derivedFrom: string | null }>({
  derived,
  existing,
  update,
  createMany,
  deleteMany,
}: {
  derived: T[];
  existing: ExistingRegisterRow[];
  update: (args: { id: string; row: T }) => Promise<unknown>;
  createMany: (rows: Array<{ row: T; position: number }>) => Promise<unknown>;
  deleteMany: (ids: string[]) => Promise<unknown>;
}): Promise<void> {
  const sorted = [...existing].sort((a, b) => a.position - b.position);
  const existingByKey = new Map<string, ExistingRegisterRow>();
  for (const { key, row } of keyByProvenance(sorted)) {
    if (key) existingByKey.set(key, row);
  }

  const kept = new Set<string>();
  const toCreate: T[] = [];
  for (const { key, row } of keyByProvenance(derived)) {
    const match = key ? existingByKey.get(key) : undefined;
    if (!match) {
      toCreate.push(row);
      continue;
    }
    kept.add(match.id);
    if (match.source === 'manual') continue;
    await update({ id: match.id, row });
  }

  const stale = sorted
    .filter((row) => row.source === 'derived' && !kept.has(row.id))
    .map((row) => row.id);
  if (stale.length > 0) await deleteMany(stale);

  if (toCreate.length === 0) return;
  const start = sorted.reduce((max, row) => Math.max(max, row.position + 1), 0);
  await createMany(toCreate.map((row, index) => ({ row, position: start + index })));
}
