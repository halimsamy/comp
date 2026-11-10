import 'server-only';

import { vectorIndex } from './client';
import { logger } from '@/utils/logger';
import type { VectorRecord } from './pg-vector-index';

export type SourceType =
  | 'policy'
  | 'context'
  | 'manual_answer'
  | 'knowledge_base_document';

export interface ExistingEmbedding {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  updatedAt?: string;
}

const SOURCE_TYPES: readonly string[] = [
  'policy',
  'context',
  'manual_answer',
  'knowledge_base_document',
];

function toExistingEmbedding(record: VectorRecord): ExistingEmbedding {
  const metadata = record.metadata ?? {};
  return {
    id: record.id,
    sourceId: typeof metadata.sourceId === 'string' ? metadata.sourceId : '',
    sourceType: metadata.sourceType as SourceType,
    updatedAt:
      typeof metadata.updatedAt === 'string' ? metadata.updatedAt : undefined,
  };
}

/**
 * Finds every embedding (all chunks) for one policy, context, manual answer or
 * knowledge base document, by exact metadata match.
 */
export async function findEmbeddingsForSource(
  sourceId: string,
  sourceType: SourceType,
  organizationId: string,
): Promise<ExistingEmbedding[]> {
  if (!vectorIndex || !sourceId || !organizationId) {
    return [];
  }

  const records = await vectorIndex.list({ organizationId, sourceType, sourceId });
  logger.info('Found embeddings for source', {
    sourceId,
    sourceType,
    organizationId,
    count: records.length,
  });
  return records.map(toExistingEmbedding);
}

/**
 * Finds every embedding of an organization, grouped by sourceId (for orphan detection).
 */
export async function findAllOrganizationEmbeddings(
  organizationId: string,
): Promise<Map<string, ExistingEmbedding[]>> {
  if (!vectorIndex || !organizationId || organizationId.trim().length === 0) {
    return new Map();
  }

  const records = await vectorIndex.list({ organizationId });
  const grouped = new Map<string, ExistingEmbedding[]>();
  for (const record of records) {
    const embedding = toExistingEmbedding(record);
    if (!SOURCE_TYPES.includes(embedding.sourceType)) continue;
    const list = grouped.get(embedding.sourceId) ?? [];
    list.push(embedding);
    grouped.set(embedding.sourceId, list);
  }

  logger.info('Found existing embeddings for organization', {
    organizationId,
    totalEmbeddings: records.length,
    uniqueSources: grouped.size,
  });
  return grouped;
}
