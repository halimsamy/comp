import 'server-only';

import { vectorIndex } from './client';
import { logger } from '@/utils/logger';

/** Deletes every embedding of an organization (exact, one statement). */
export async function deleteOrganizationEmbeddings(
  organizationId: string,
): Promise<void> {
  if (!vectorIndex) {
    logger.warn('Vector store is not configured, skipping deletion');
    return;
  }

  if (!organizationId || organizationId.trim().length === 0) {
    logger.warn('Invalid organizationId provided for deletion');
    return;
  }

  const { deleted } = await vectorIndex.deleteWhere({ organizationId });
  logger.info('Deleted organization embeddings', { organizationId, deleted });
}
