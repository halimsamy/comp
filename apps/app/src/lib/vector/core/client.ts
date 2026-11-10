import 'server-only';

import { db } from '@db/server';
import { PgVectorIndex } from './pg-vector-index';

// Embeddings live in the main Postgres (pgvector), so search is always available.
export const vectorIndex: PgVectorIndex | null = new PgVectorIndex(db);
