import { vectorIndex } from './client';
import { logger } from '../../logger';

/** Counts an organization's embeddings by source type (exact). */
export async function countEmbeddings(
  organizationId: string,
  sourceType?: 'policy' | 'context' | 'manual_answer',
): Promise<{
  total: number;
  bySourceType: Record<string, number>;
  error?: string;
}> {
  if (!vectorIndex) {
    return { total: 0, bySourceType: {}, error: 'Vector DB not configured' };
  }

  try {
    const records = await vectorIndex.list({ organizationId, sourceType });
    const bySourceType: Record<string, number> = {};
    for (const record of records) {
      const st =
        typeof record.metadata?.sourceType === 'string'
          ? record.metadata.sourceType
          : 'unknown';
      bySourceType[st] = (bySourceType[st] ?? 0) + 1;
    }

    logger.info('Counted embeddings', {
      organizationId,
      sourceType: sourceType || 'all',
      total: records.length,
      bySourceType,
    });
    return { total: records.length, bySourceType };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to count embeddings', { organizationId, sourceType, error: message });
    return { total: 0, bySourceType: {}, error: message };
  }
}

/** Lists an organization's manual answer embeddings (exact). */
export async function listManualAnswerEmbeddings(
  organizationId: string,
): Promise<
  Array<{ id: string; sourceId: string; content: string; updatedAt?: string }>
> {
  if (!vectorIndex) {
    return [];
  }

  try {
    const records = await vectorIndex.list({
      organizationId,
      sourceType: 'manual_answer',
    });
    return records.map((record) => {
      const metadata = record.metadata ?? {};
      return {
        id: record.id,
        sourceId: typeof metadata.sourceId === 'string' ? metadata.sourceId : '',
        content: typeof metadata.content === 'string' ? metadata.content : '',
        updatedAt:
          typeof metadata.updatedAt === 'string' ? metadata.updatedAt : undefined,
      };
    });
  } catch (error) {
    logger.error('Failed to list manual answer embeddings', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}
