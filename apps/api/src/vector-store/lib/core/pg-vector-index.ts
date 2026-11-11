/**
 * pgvector-backed replacement for the subset of the Upstash Vector `Index` API
 * this codebase uses (upsert, query, fetch, delete, range, info). Rows live in
 * the "VectorEmbedding" table of the main Postgres database.
 *
 * Kept in sync with apps/app/src/lib/vector/core/pg-vector-index.ts.
 *
 * Scores keep Upstash's COSINE scale, (1 + cosine similarity) / 2 in [0, 1],
 * so existing similarity thresholds keep their meaning.
 */

type Metadata = Record<string, unknown>;

export interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface VectorFilter {
  organizationId: string;
  /** Only rows whose metadata.sourceType is one of these. */
  sourceTypes?: readonly string[];
}

/** Exact metadata match; organizationId is required so no call can span tenants. */
export interface MetadataFilter {
  organizationId: string;
  sourceType?: string;
  sourceId?: string;
}

const metadataWhere = (filter: MetadataFilter) => {
  if (!filter.organizationId) {
    throw new Error('organizationId is required');
  }
  const values: unknown[] = [filter.organizationId];
  const clauses = [`"organizationId" = $1`];
  if (filter.sourceType !== undefined) {
    values.push(filter.sourceType);
    clauses.push(`"metadata"->>'sourceType' = $${values.length}`);
  }
  if (filter.sourceId !== undefined) {
    values.push(filter.sourceId);
    clauses.push(`"metadata"->>'sourceId' = $${values.length}`);
  }
  return { where: clauses.join(' AND '), values };
};

export interface VectorRecord {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Metadata;
}

export interface UpsertItem {
  id: string;
  vector: number[];
  metadata?: Metadata;
}

export interface RangeResult {
  vectors: VectorRecord[];
  /** Empty string when there are no more pages. */
  nextCursor: string;
}

interface Row {
  id: string;
  metadata: Metadata | null;
  embedding?: string;
  distance?: number;
}

const toSqlVector = (vector: number[]): string => {
  if (!vector.every((v) => Number.isFinite(v))) {
    throw new Error('Vector contains non-finite values');
  }
  return `[${vector.join(',')}]`;
};

const columns = (includeVectors: boolean | undefined) =>
  includeVectors
    ? `"id", "metadata", "embedding"::text AS "embedding"`
    : `"id", "metadata"`;

const toRecord = (row: Row, includeVectors: boolean): VectorRecord => ({
  id: row.id,
  score: row.distance === undefined ? 1 : 1 - Number(row.distance) / 2,
  metadata: row.metadata ?? undefined,
  ...(includeVectors && row.embedding
    ? { vector: JSON.parse(row.embedding) as number[] }
    : {}),
});

export class PgVectorIndex {
  constructor(private readonly db: SqlClient) {}

  async upsert(items: UpsertItem | UpsertItem[]): Promise<'Success'> {
    const list = Array.isArray(items) ? items : [items];
    if (list.length === 0) return 'Success';

    const values: unknown[] = [];
    const tuples = list.map((item) => {
      const organizationId = item.metadata?.organizationId;
      values.push(
        item.id,
        typeof organizationId === 'string' ? organizationId : null,
        toSqlVector(item.vector),
        JSON.stringify(item.metadata ?? {}),
      );
      const n = values.length;
      return `($${n - 3}, $${n - 2}, $${n - 1}::vector, $${n}::jsonb, now())`;
    });

    await this.db.$executeRawUnsafe(
      `INSERT INTO "VectorEmbedding" ("id", "organizationId", "embedding", "metadata", "updatedAt")
       VALUES ${tuples.join(', ')}
       ON CONFLICT ("id") DO UPDATE SET
         "organizationId" = EXCLUDED."organizationId",
         "embedding" = EXCLUDED."embedding",
         "metadata" = EXCLUDED."metadata",
         "updatedAt" = now()`,
      ...values,
    );
    return 'Success';
  }

  async query(params: {
    vector: number[];
    topK: number;
    includeMetadata?: boolean;
    includeVectors?: boolean;
    filter?: VectorFilter;
  }): Promise<VectorRecord[]> {
    const values: unknown[] = [
      toSqlVector(params.vector),
      Math.max(1, Math.floor(params.topK)),
    ];
    let where = '';
    if (params.filter) {
      values.push(params.filter.organizationId);
      where = `WHERE "organizationId" = $3`;
      if (params.filter.sourceTypes) {
        values.push(params.filter.sourceTypes);
        where += ` AND "metadata"->>'sourceType' = ANY($4::text[])`;
      }
    }
    const rows = await this.db.$queryRawUnsafe<Row[]>(
      `SELECT ${columns(params.includeVectors)}, "embedding" <=> $1::vector AS "distance"
       FROM "VectorEmbedding" ${where}
       ORDER BY "embedding" <=> $1::vector
       LIMIT $2`,
      ...values,
    );
    return rows.map((row) => toRecord(row, Boolean(params.includeVectors)));
  }

  async fetch(
    ids: string[],
    options: { includeVectors?: boolean; includeMetadata?: boolean } = {},
  ): Promise<(VectorRecord | null)[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.$queryRawUnsafe<Row[]>(
      `SELECT ${columns(options.includeVectors)}
       FROM "VectorEmbedding" WHERE "id" = ANY($1::text[])`,
      ids,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      return row ? toRecord(row, Boolean(options.includeVectors)) : null;
    });
  }

  async delete(ids: string | string[]): Promise<{ deleted: number }> {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0) return { deleted: 0 };
    const deleted = await this.db.$executeRawUnsafe(
      `DELETE FROM "VectorEmbedding" WHERE "id" = ANY($1::text[])`,
      list,
    );
    return { deleted };
  }

  /** Lists ids in order, optionally under a prefix. `cursor` is the last id seen ('0' or '' to start). */
  async range(params: {
    cursor: string | number;
    limit: number;
    prefix?: string;
    includeVectors?: boolean;
    includeMetadata?: boolean;
  }): Promise<RangeResult> {
    const cursor = String(params.cursor);
    const limit = Math.max(1, Math.floor(params.limit));
    const rows = await this.db.$queryRawUnsafe<Row[]>(
      `SELECT ${columns(params.includeVectors)}
       FROM "VectorEmbedding"
       WHERE ($1 = '' OR "id" COLLATE "C" > $1) AND starts_with("id", $2)
       ORDER BY "id" COLLATE "C"
       LIMIT $3`,
      cursor === '0' ? '' : cursor,
      params.prefix ?? '',
      limit,
    );
    const vectors = rows.map((row) =>
      toRecord(row, Boolean(params.includeVectors)),
    );
    const last = rows.at(-1);
    return {
      vectors,
      nextCursor: rows.length === limit && last ? last.id : '',
    };
  }

  /** Every row matching the metadata filter, exactly (no similarity search, no top-K cap). */
  async list(filter: MetadataFilter): Promise<VectorRecord[]> {
    const { where, values } = metadataWhere(filter);
    const rows = await this.db.$queryRawUnsafe<Row[]>(
      `SELECT "id", "metadata" FROM "VectorEmbedding" WHERE ${where} ORDER BY "id" COLLATE "C"`,
      ...values,
    );
    return rows.map((row) => toRecord(row, false));
  }

  /** Deletes every row matching the metadata filter in one statement. */
  async deleteWhere(filter: MetadataFilter): Promise<{ deleted: number }> {
    const { where, values } = metadataWhere(filter);
    const deleted = await this.db.$executeRawUnsafe(
      `DELETE FROM "VectorEmbedding" WHERE ${where}`,
      ...values,
    );
    return { deleted };
  }

  /** Writes are synchronous in Postgres, so nothing is ever pending. */
  async info(): Promise<{ vectorCount: number; pendingVectorCount: number }> {
    const [row] = await this.db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS "count" FROM "VectorEmbedding"`,
    );
    return { vectorCount: Number(row?.count ?? 0), pendingVectorCount: 0 };
  }
}
