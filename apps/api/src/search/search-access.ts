import { permissionsGrant, resolveRolePermissions } from '../auth/app-access';
import { resolveServiceByName } from '../auth/service-token.config';
import type { AuthContext } from '../auth/types';

export type PermissionCheck = (resource: string, action: string) => boolean;

/**
 * The caller's effective permissions, resolved the same way PermissionGuard
 * authorizes them, so the search index never lists objects the caller can't open.
 */
export async function resolvePermissionCheck(
  ctx: AuthContext,
): Promise<PermissionCheck> {
  if (ctx.isPlatformAdmin) return () => true;
  if (ctx.isApiKey) {
    const scopes = ctx.apiKeyScopes ?? [];
    // Legacy unscoped keys have full access (PermissionGuard blocks them after their deprecation date).
    if (scopes.length === 0) return () => true;
    return (resource, action) => scopes.includes(`${resource}:${action}`);
  }
  if (ctx.isServiceToken) {
    const granted = resolveServiceByName(ctx.serviceName)?.permissions ?? [];
    return (resource, action) => granted.includes(`${resource}:${action}`);
  }
  const roles = (ctx.userRoles ?? [])
    .map((role) => role.trim())
    .filter(Boolean);
  const permissions = await resolveRolePermissions(ctx.organizationId, roles);
  return (resource, action) => permissionsGrant(permissions, resource, action);
}
