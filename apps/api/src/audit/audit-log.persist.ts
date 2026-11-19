import { db, Prisma } from '@db';
import type { AuthenticatedRequest } from '../auth/types';
import { RESOURCE_TO_ENTITY_TYPE } from './audit-log.constants';
import {
  entityName,
  requestMeta,
  routeLabel,
  searchText,
} from './audit-log.request-meta';
import {
  type AuditContextOverride,
  type ChangesRecord,
  buildDescription,
  extractEntityId,
} from './audit-log.utils';

/** Writes one audit row. A `failure` records a rejected mutation (outcome + HTTP status). */
export async function persistAuditLog({
  organizationId,
  userId,
  memberId,
  method,
  path,
  resource,
  action,
  request,
  responseBody,
  changes,
  commentContext,
  descriptionOverride,
  impersonatedBy,
  callerLabel,
  failure,
}: {
  organizationId: string;
  userId: string;
  memberId: string | undefined;
  method: string;
  path: string;
  resource: string;
  action: string;
  request: AuthenticatedRequest;
  responseBody: unknown;
  changes: ChangesRecord | null;
  commentContext: AuditContextOverride | null;
  descriptionOverride: string | null;
  impersonatedBy?: string;
  callerLabel?: string;
  failure?: { statusCode: number };
}): Promise<void> {
  const route = routeLabel(path);
  const entityType =
    commentContext?.entityType ??
    route?.entityType ??
    RESOURCE_TO_ENTITY_TYPE[resource] ??
    null;
  const entityId =
    commentContext?.entityId ?? extractEntityId(request, method, responseBody);
  const description =
    commentContext?.description ??
    descriptionOverride ??
    buildDescription(method, action, route?.label ?? resource);
  const name = entityName(responseBody);
  const text = searchText({ name, changes });

  const auditData: Record<string, unknown> = {
    action: description,
    method,
    path,
    resource: route?.resource ?? resource,
    permission: action,
    ...requestMeta(request),
  };
  if (changes) auditData.changes = changes;
  if (name) auditData.entityName = name;
  if (text) auditData.searchText = text;
  if (impersonatedBy) auditData.impersonatedBy = impersonatedBy;
  // Record automated-caller provenance (e.g. 'via API key "CI Pipeline"') so an
  // owner-fallback / key-creator attribution isn't read as the user personally
  // acting in a session — preserves non-repudiation of the audit trail.
  if (callerLabel) auditData.via = callerLabel;
  if (failure) {
    auditData.outcome = 'failure';
    auditData.statusCode = failure.statusCode;
  }

  const finalDescription = `${impersonatedBy ? '[Impersonated] ' : ''}${
    failure ? 'Failed: ' : ''
  }${description}${callerLabel ? ` [${callerLabel}]` : ''}`;

  await db.auditLog.create({
    data: {
      organizationId,
      userId,
      memberId: memberId ?? null,
      entityType,
      entityId,
      description: finalDescription,
      data: auditData as Prisma.InputJsonValue,
    },
  });
}
