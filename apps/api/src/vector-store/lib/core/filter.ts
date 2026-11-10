import type { VectorFilter } from './pg-vector-index';

/**
 * Prefixed CUID (`org_` + lowercase alphanumeric). The query is parameterized, but
 * a malformed ID still means a caller bug, so reject it instead of returning nothing.
 */
const ORGANIZATION_ID_PATTERN = /^org_[a-z0-9]{16,32}$/;

/** Builds a vector filter scoping a query to one organization. */
export function organizationFilter(organizationId: string): VectorFilter {
  if (!ORGANIZATION_ID_PATTERN.test(organizationId)) {
    throw new Error('Invalid organizationId for vector filter');
  }
  return { organizationId };
}
