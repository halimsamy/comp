import { logger, tags, task } from '@trycompai/jobs';
import { vectorIndex } from '@/vector-store/lib/core/client';

/**
 * Deletes every embedding (all chunks) of a Knowledge Base document from the
 * vector store, then verifies none remain. Failures throw so the job retries.
 */
export const deleteKnowledgeBaseDocumentTask = task({
  id: 'delete-knowledge-base-document-from-vector',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: { documentId: string; organizationId: string }) => {
    await tags.add([`org:${payload.organizationId}`]);

    if (!vectorIndex) {
      logger.error('Vector index not configured');
      return {
        success: false,
        documentId: payload.documentId,
        error: 'Vector index not configured',
      };
    }

    const filter = {
      organizationId: payload.organizationId,
      sourceType: 'knowledge_base_document',
      sourceId: payload.documentId,
    };

    const { deleted } = await vectorIndex.deleteWhere(filter);
    const remaining = await vectorIndex.list(filter);
    if (remaining.length > 0) {
      throw new Error(
        `${remaining.length} embeddings remain for document ${payload.documentId} after deletion`,
      );
    }

    logger.info('Deleted Knowledge Base document embeddings from vector DB', {
      documentId: payload.documentId,
      deletedCount: deleted,
    });

    return {
      success: true,
      documentId: payload.documentId,
      deletedCount: deleted,
    };
  },
});
