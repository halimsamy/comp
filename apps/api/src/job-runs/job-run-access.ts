import { resolveRolePermissions } from '../auth/app-access';
import { resolveServiceByName } from '../auth/service-token.config';
import type { AuthenticatedRequest } from '../auth/types';

/**
 * Only reviewed tasks may expose output/metadata through GET /v1/job-runs/:runId.
 * Each entry lists every resource whose private data the run's output or
 * metadata contains; the caller needs `read` on all of them. Unlisted tasks
 * are denied (404). Add a task here when a UI starts polling it.
 */
export const JOB_RUN_READ_RESOURCES: ReadonlyMap<string, readonly string[]> = new Map([
  ['update-policy', ['policy']],
  ['onboarding-update-policy', ['policy']],
  ['generate-full-policies', ['policy']],
  ['migrate-policies-for-org', ['policy']],
  ['generate-vendor-mitigation', ['vendor']],
  ['generate-vendor-mitigations-for-org', ['vendor']],
  ['score-vendor-risk', ['vendor']],
  ['research-vendor', ['vendor']],
  ['vendor-risk-assessment-task', ['vendor']],
  ['generate-risk-mitigation', ['risk']],
  ['generate-risk-mitigations-for-org', ['risk']],
  ['link-risks-and-vendors-to-work', ['risk', 'vendor', 'task']],
  ['generate-auditor-content', ['audit']],
  ['initialize-organization', ['organization', 'framework']],
  ['onboard-organization', ['organization', 'policy', 'vendor', 'risk']],
  ['export-organization-evidence', ['evidence']],
  ['run-integration-tests', ['integration']],
  ['send-integration-results', ['integration']],
  ['run-cloud-security-scan', ['integration']],
  ['run-connection-checks', ['integration']],
  ['run-task-integration-checks', ['integration', 'task']],
  ['run-org-integration-checks', ['integration', 'task']],
  ['run-device-sync', ['integration', 'member']],
  ['remediate-preview', ['integration']],
  ['remediate-single', ['integration']],
  ['remediate-batch', ['integration']],
  ['analyze-vendor-login', ['integration']],
  ['test-vendor-instruction', ['integration']],
  ['sign-in-vendor-profile', ['integration']],
  ['execute-automation-live', ['integration', 'task']],
  ['run-browser-automation', ['integration', 'task']],
  ['parse-questionnaire', ['questionnaire']],
  ['internal-parse-questionnaire', ['questionnaire']],
  ['answer-question', ['questionnaire']],
  ['auto-answer-questionnaire', ['questionnaire']],
  ['process-knowledge-base-document', ['questionnaire']],
  ['process-knowledge-base-documents-orchestrator', ['questionnaire']],
  ['delete-knowledge-base-document-from-vector', ['questionnaire']],
]);

/** Permissions of the caller in its active organization, per auth method. */
async function callerPermissions(
  request: AuthenticatedRequest,
): Promise<(resource: string) => boolean> {
  if (request.isPlatformAdmin) return () => true;
  if (request.isApiKey) {
    // Empty (legacy) scopes were retired; PermissionGuard already blocks them.
    const scopes = request.apiKeyScopes ?? [];
    return (resource) => scopes.includes(`${resource}:read`);
  }
  if (request.isServiceToken) {
    const service = resolveServiceByName(request.serviceName);
    return (resource) => service?.permissions.includes(`${resource}:read`) ?? false;
  }
  const roles = (request.userRoles ?? []).map((role) => role.trim()).filter(Boolean);
  if (roles.length === 0) return () => false;
  const permissions = await resolveRolePermissions(request.organizationId, roles);
  return (resource) => permissions[resource]?.includes('read') ?? false;
}

export async function canReadJobRun(params: {
  request: AuthenticatedRequest;
  taskId: string;
}): Promise<boolean> {
  const resources = JOB_RUN_READ_RESOURCES.get(params.taskId);
  if (!resources) return false;
  const canRead = await callerPermissions(params.request);
  return resources.every(canRead);
}
