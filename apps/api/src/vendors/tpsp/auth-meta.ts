import type { AuthContext } from '../../auth/types';

/** `authType` + `authenticatedUser` envelope every vendor endpoint returns. */
export function authMeta(authContext: AuthContext) {
  return {
    authType: authContext.authType,
    ...(authContext.userId &&
      authContext.userEmail && {
        authenticatedUser: {
          id: authContext.userId,
          email: authContext.userEmail,
        },
      }),
  };
}
