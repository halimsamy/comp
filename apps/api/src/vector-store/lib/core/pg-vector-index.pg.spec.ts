/**
 * Runs PgVectorIndex against a real Postgres with pgvector and the
 * VectorEmbedding migration applied. Skipped unless PGVECTOR_TEST_URL is set, e.g.
 *   docker run -d -e POSTGRES_PASSWORD=pg -p 55433:5432 pgvector/pgvector:pg17
 *   DATABASE_URL=postgresql://postgres:pg@localhost:55433/postgres bunx prisma migrate deploy  (in packages/db)
 *   PGVECTOR_TEST_URL=postgresql://postgres:pg@localhost:55433/postgres npx jest pg-vector-index.pg
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { PgVectorIndex } from './pg-vector-index';

const url = process.env.PGVECTOR_TEST_URL;
const describeIfDb = url ? describe : describe.skip;

const unit = (hot: number): number[] => {
  const v = new Array<number>(1024).fill(0);
  v[hot] = 1;
  return v;
};

describeIfDb('PgVectorIndex (live pgvector)', () => {
  let db: PrismaClient;
  let index: PgVectorIndex;

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    index = new PgVectorIndex(db);
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe('DELETE FROM "VectorEmbedding"');
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('upserts, queries by org with Upstash-scale cosine scores, fetches and deletes', async () => {
    await index.upsert([
      { id: 'task_org_a_1', vector: unit(0), metadata: { organizationId: 'org_a', content: 'a1' } },
      { id: 'task_org_a_2', vector: unit(1), metadata: { organizationId: 'org_a', content: 'a2' } },
      { id: 'task_org_b_1', vector: unit(0), metadata: { organizationId: 'org_b', content: 'b1' } },
    ]);
    // Re-upserting the same id overwrites it.
    await index.upsert({
      id: 'task_org_a_2',
      vector: unit(1),
      metadata: { organizationId: 'org_a', content: 'a2-updated' },
    });

    const results = await index.query({
      vector: unit(0),
      topK: 10,
      filter: { organizationId: 'org_a' },
    });
    expect(results.map((r) => r.id)).toEqual(['task_org_a_1', 'task_org_a_2']);
    expect(results[0]!.score).toBeCloseTo(1); // identical
    expect(results[1]!.score).toBeCloseTo(0.5); // orthogonal
    expect(results[1]!.metadata).toEqual({ organizationId: 'org_a', content: 'a2-updated' });
    expect(results[0]!.vector).toBeUndefined();

    const [hit, miss] = await index.fetch(['task_org_a_1', 'nope'], { includeVectors: true });
    expect(hit?.vector?.[0]).toBe(1);
    expect(miss).toBeNull();

    await expect(index.delete(['task_org_a_1', 'task_org_b_1'])).resolves.toEqual({ deleted: 2 });
    await expect(index.info()).resolves.toEqual({ vectorCount: 1, pendingVectorCount: 0 });
  });

  it('lists and deletes every chunk of one source, and nothing else', async () => {
    const chunk = (id: string, organizationId: string, sourceId: string) => ({
      id,
      vector: unit(3),
      metadata: { organizationId, sourceType: 'knowledge_base_document', sourceId },
    });
    // More chunks than any old top-K cap would have returned.
    await index.upsert(Array.from({ length: 150 }, (_, i) => chunk(`kb_doc1_${i}`, 'org_a', 'doc1')));
    await index.upsert([chunk('kb_doc2_0', 'org_a', 'doc2'), chunk('kb_other_0', 'org_b', 'doc1')]);

    const filter = { organizationId: 'org_a', sourceType: 'knowledge_base_document', sourceId: 'doc1' };
    await expect(index.list(filter)).resolves.toHaveLength(150);
    await expect(index.deleteWhere(filter)).resolves.toEqual({ deleted: 150 });
    await expect(index.list(filter)).resolves.toEqual([]);
    await expect(index.list({ organizationId: 'org_a' })).resolves.toHaveLength(1);
    await expect(index.list({ organizationId: 'org_b' })).resolves.toHaveLength(1);
  });

  it('pages through a prefix with range', async () => {
    await index.upsert(
      ['a', 'b', 'c', 'd', 'e'].map((s) => ({
        id: `task_org_a_${s}`,
        vector: unit(2),
        metadata: { organizationId: 'org_a' },
      })),
    );
    await index.upsert({ id: 'task_org_b_x', vector: unit(2), metadata: { organizationId: 'org_b' } });

    const ids: string[] = [];
    let cursor: string = '0';
    for (let page = 0; page < 10; page++) {
      const { vectors, nextCursor } = await index.range({ cursor, limit: 2, prefix: 'task_org_a_' });
      ids.push(...vectors.map((v) => v.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'].map((s) => `task_org_a_${s}`));
  });
});
