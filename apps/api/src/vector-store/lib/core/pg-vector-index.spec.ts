import { PgVectorIndex, type SqlClient } from './pg-vector-index';

const makeDb = (rows: unknown[] = []) => {
  const db = {
    $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
    $executeRawUnsafe: jest.fn().mockResolvedValue(rows.length),
  };
  return { db, index: new PgVectorIndex(db as SqlClient) };
};

describe('PgVectorIndex', () => {
  it('maps cosine distance to the Upstash (1 + cos) / 2 score and scopes by org with a bound parameter', async () => {
    const { db, index } = makeDb([
      { id: 'a', metadata: { organizationId: 'org_1' }, distance: 0 },
      { id: 'b', metadata: null, distance: 1 },
    ]);

    const results = await index.query({
      vector: [1, 0],
      topK: 5,
      filter: { organizationId: 'org_1" OR 1=1' },
    });

    expect(results).toEqual([
      { id: 'a', score: 1, metadata: { organizationId: 'org_1' } },
      { id: 'b', score: 0.5, metadata: undefined },
    ]);
    const [sql, ...params] = db.$queryRawUnsafe.mock.calls[0]!;
    expect(sql).toContain('WHERE "organizationId" = $3');
    expect(sql).not.toContain('"embedding"::text');
    expect(params).toEqual(['[1,0]', 5, 'org_1" OR 1=1']);
  });

  it('upserts every item in one statement and keeps organizationId in its own column', async () => {
    const { db, index } = makeDb();
    await index.upsert([
      { id: 'x', vector: [0.5], metadata: { organizationId: 'org_1' } },
      { id: 'y', vector: [1] },
    ]);
    const [sql, ...params] = db.$executeRawUnsafe.mock.calls[0]!;
    expect(sql).toContain('ON CONFLICT ("id") DO UPDATE');
    expect(params).toEqual(['x', 'org_1', '[0.5]', '{"organizationId":"org_1"}', 'y', null, '[1]', '{}']);
  });

  it('rejects vectors with non-finite values', async () => {
    const { index } = makeDb();
    await expect(index.upsert({ id: 'x', vector: [Number.NaN] })).rejects.toThrow('non-finite');
  });

  it('returns fetch results in request order with null for misses', async () => {
    const { index } = makeDb([{ id: 'b', metadata: {}, embedding: '[1,2]' }]);
    await expect(index.fetch(['a', 'b'], { includeVectors: true })).resolves.toEqual([
      null,
      { id: 'b', score: 1, metadata: {}, vector: [1, 2] },
    ]);
  });

  it('range starts at cursor "0" and stops when a page is short', async () => {
    const { db, index } = makeDb([{ id: 'p_1', metadata: {} }]);
    const page = await index.range({ cursor: '0', limit: 2, prefix: 'p_' });
    expect(page.nextCursor).toBe('');
    expect(db.$queryRawUnsafe.mock.calls[0]!.slice(1)).toEqual(['', 'p_', 2]);
  });

  it('lists and deletes by exact metadata match with bound parameters', async () => {
    const { db, index } = makeDb([{ id: 'kb_1', metadata: { sourceId: 'doc_1' } }]);
    const filter = { organizationId: 'org_1', sourceType: 'knowledge_base_document', sourceId: 'doc_1' };

    await expect(index.list(filter)).resolves.toEqual([
      { id: 'kb_1', score: 1, metadata: { sourceId: 'doc_1' } },
    ]);
    const [listSql, ...listParams] = db.$queryRawUnsafe.mock.calls[0]!;
    expect(listSql).toContain(
      `"organizationId" = $1 AND "metadata"->>'sourceType' = $2 AND "metadata"->>'sourceId' = $3`,
    );
    expect(listParams).toEqual(['org_1', 'knowledge_base_document', 'doc_1']);

    await expect(index.deleteWhere({ organizationId: 'org_1' })).resolves.toEqual({ deleted: 1 });
    const [deleteSql, ...deleteParams] = db.$executeRawUnsafe.mock.calls[0]!;
    expect(deleteSql).toBe('DELETE FROM "VectorEmbedding" WHERE "organizationId" = $1');
    expect(deleteParams).toEqual(['org_1']);
  });

  it('refuses list/delete without an organizationId', async () => {
    const { index } = makeDb();
    await expect(index.deleteWhere({ organizationId: '' })).rejects.toThrow('organizationId is required');
  });

  it('reports nothing pending, since Postgres writes are immediately visible', async () => {
    const { index } = makeDb([{ count: BigInt(3) }]);
    await expect(index.info()).resolves.toEqual({ vectorCount: 3, pendingVectorCount: 0 });
  });
});
