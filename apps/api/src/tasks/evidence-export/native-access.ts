import {
  permissionsGrant,
  resolveRolePermissions,
} from '../../auth/app-access';
import type { GRCResource } from '../../auth/require-permission.decorator';
import { resolveServiceByName } from '../../auth/service-token.config';
import type { AuthContext } from '../../auth/types';
import type { NativeAccess } from './framework-evidence-native';
import { REGISTER_KEYS, REGISTERS } from './registers/registers';

/**
 * Which of `resources` the caller can read, with PermissionGuard's precedence
 * (platform admin → API key scopes → service token → roles).
 */
export async function readableResources({
  ctx,
  resources,
}: {
  ctx: AuthContext;
  resources: GRCResource[];
}): Promise<Set<GRCResource>> {
  if (ctx.isPlatformAdmin) return new Set(resources);

  let grants: (resource: GRCResource) => boolean;
  if (ctx.isApiKey) {
    // Legacy keys with empty scopes are blocked by PermissionGuard, so never reach here.
    const scopes = ctx.apiKeyScopes ?? [];
    grants = (r) => scopes.includes(`${r}:read`);
  } else if (ctx.isServiceToken) {
    const permissions =
      resolveServiceByName(ctx.serviceName)?.permissions ?? [];
    grants = (r) => permissions.includes(`${r}:read`);
  } else {
    const perms = await resolveRolePermissions(
      ctx.organizationId,
      ctx.userRoles ?? [],
    );
    grants = (r) => permissionsGrant(perms, r, 'read');
  }
  return new Set(resources.filter(grants));
}

/**
 * The registers (risk/vendor/member/finding read) and SoA (audit read) the
 * caller may see in a framework export. Missing ones are left out of the ZIP,
 * never a reason to fail the export.
 */
export async function resolveNativeAccess(
  ctx: AuthContext,
): Promise<NativeAccess> {
  const resources = Array.from(
    new Set<GRCResource>([
      ...REGISTER_KEYS.map((k) => REGISTERS[k].resource),
      'audit',
    ]),
  );
  const readable = await readableResources({ ctx, resources });
  return {
    registers: REGISTER_KEYS.filter((k) => readable.has(REGISTERS[k].resource)),
    soa: readable.has('audit'),
  };
}
