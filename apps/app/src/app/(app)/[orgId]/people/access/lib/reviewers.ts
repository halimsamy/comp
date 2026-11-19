import { BUILT_IN_ROLE_PERMISSIONS } from '@trycompai/auth';

/**
 * #81: only members whose roles grant member:update can decide in a review, so
 * only they are offered as reviewers. Custom roles are resolved from the org's
 * role list.
 */
export function canReviewAccess({
  role,
  customRoles,
}: {
  role: string;
  customRoles: { name: string; permissions: Record<string, string[]> }[];
}): boolean {
  return role
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .some((name) => {
      const permissions = BUILT_IN_ROLE_PERMISSIONS[name] ?? customRoles.find((c) => c.name === name)?.permissions;
      return permissions?.member?.includes('update') ?? false;
    });
}
