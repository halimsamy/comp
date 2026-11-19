import {
  type ChangesRecord,
  buildChanges,
  extractActionDescription,
  extractCommentContext,
  extractDownloadDescription,
  extractFindingDescription,
  extractPolicyActionDescription,
  extractVersionDescription,
} from './audit-log.utils';
import { REDACT_BODY_RESOURCES } from './audit-log.constants';
import type { RelationMappingResult } from './audit-log.utils';

/** The diff and description override an audited mutation gets, by kind of endpoint. */
export function resolveAuditChanges({
  request,
  method,
  resource,
  requestBody,
  responseBody,
  previousValues,
  memberNames,
  relationMappingResult,
}: {
  request: { url: string; userRoles?: string[] | null };
  method: string;
  resource: string;
  requestBody: Record<string, unknown> | undefined;
  responseBody: unknown;
  previousValues: Record<string, unknown> | null;
  memberNames: Record<string, string>;
  relationMappingResult: RelationMappingResult | null;
}) {
  const commentCtx = extractCommentContext(request.url, method, requestBody);

  let changes: ChangesRecord | null;
  const versionDesc = extractVersionDescription(
    request.url,
    method,
    responseBody,
    requestBody,
  );
  const actionDesc = extractActionDescription(request.url, method);
  const downloadDesc = extractDownloadDescription(request.url, method);
  const policyActionDesc = extractPolicyActionDescription(
    request.url,
    method,
    requestBody,
  );
  const findingDesc = extractFindingDescription(
    request.url,
    method,
    resource,
    request.userRoles ?? undefined,
  );
  let descriptionOverride: string | null =
    actionDesc ??
    versionDesc ??
    downloadDesc ??
    policyActionDesc ??
    findingDesc;

  const isAutomationUpdate =
    policyActionDesc && /automations/.test(request.url) && method === 'PATCH';
  const isAttachmentAction =
    policyActionDesc && /attachments/.test(request.url);

  if (
    commentCtx ||
    versionDesc ||
    (policyActionDesc && !isAutomationUpdate && !isAttachmentAction)
  ) {
    // Comments and version operations don't produce meaningful diffs
    // But preserve the comment/reason/changelog if provided in the request body
    const note = requestBody?.comment || requestBody?.changelog;
    const noteLabel = requestBody?.changelog ? 'changelog' : 'reason';
    changes =
      note && typeof note === 'string'
        ? { [noteLabel]: { previous: null, current: note } }
        : null;
  } else if (isAttachmentAction) {
    // For attachments, show file details in the expandable section
    // Upload: file info in request body. Delete: file info in response body.
    const attachmentChanges: ChangesRecord = {};
    const fileName =
      requestBody?.fileName ||
      (responseBody && typeof responseBody === 'object'
        ? (responseBody as Record<string, unknown>).fileName
        : null);
    const fileType =
      requestBody?.fileType ||
      (responseBody && typeof responseBody === 'object'
        ? (responseBody as Record<string, unknown>).fileType
        : null);
    if (fileName)
      attachmentChanges.file = {
        previous: null,
        current: fileName,
      };
    if (fileType)
      attachmentChanges.type = {
        previous: null,
        current: fileType,
      };
    changes =
      Object.keys(attachmentChanges).length > 0 ? attachmentChanges : null;
  } else if (relationMappingResult) {
    changes = relationMappingResult.changes;
    descriptionOverride ??= relationMappingResult.description;
  } else if (REDACT_BODY_RESOURCES.has(resource)) {
    // Credential resources (e.g. the secret manager) carry their
    // secret in a generically-named field. Diffing the body would
    // land plaintext in a store readable with only app:read, which
    // bypasses <resource>:read. Record the action, not the payload.
    changes = null;
  } else {
    changes = requestBody
      ? buildChanges(requestBody, previousValues, memberNames)
      : null;
  }

  return { changes, commentCtx, descriptionOverride };
}
