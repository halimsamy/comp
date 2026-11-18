import { describe, expect, it } from 'bun:test';
import type { CheckContext, CheckFindingResult, CheckPassingResult } from '../../../../types';
import { orgMembersCheck } from '../org-members';

function makeCtx(pages: Record<string, unknown[] | Error>) {
  const passed: CheckPassingResult[] = [];
  const failed: CheckFindingResult[] = [];
  const ctx = {
    variables: { target_repos: ['acme/api', 'acme/web'] },
    log: () => {},
    warn: () => {},
    error: () => {},
    pass: (r: CheckPassingResult) => passed.push(r),
    fail: (r: CheckFindingResult) => failed.push(r),
    fetchAllPages: async <T>(path: string): Promise<T[]> => {
      const page = pages[path];
      if (page instanceof Error) throw page;
      return (page ?? []) as T[];
    },
  } as unknown as CheckContext;
  return { ctx, passed, failed };
}

const member = (login: string, type = 'User') => ({
  login,
  id: 1,
  html_url: `https://github.com/${login}`,
  type,
});

describe('orgMembersCheck', () => {
  it('emits one user row per member with role and 2FA status', async () => {
    const { ctx, passed } = makeCtx({
      '/orgs/acme/members': [member('jane'), member('bot', 'Bot')],
      '/orgs/acme/members?role=admin': [member('jane')],
      '/orgs/acme/members?filter=2fa_disabled': [member('bot', 'Bot')],
    });
    await orgMembersCheck.run(ctx);
    expect(passed).toHaveLength(2);
    expect(passed[0]).toMatchObject({
      resourceType: 'user',
      resourceId: 'acme/jane',
      evidence: { isAdmin: true, roles: ['owner'], mfa: true, type: 'human' },
    });
    expect(passed[1].evidence).toMatchObject({ isAdmin: false, mfa: false, type: 'service' });
  });

  it('leaves MFA unknown when the 2FA filter is not allowed', async () => {
    const { ctx, passed } = makeCtx({
      '/orgs/acme/members': [member('jane')],
      '/orgs/acme/members?filter=2fa_disabled': new Error('Must be an organization owner'),
    });
    await orgMembersCheck.run(ctx);
    expect(passed[0].evidence && 'mfa' in passed[0].evidence).toBe(false);
  });

  it('reports an org-level failure when members cannot be listed', async () => {
    const { ctx, passed, failed } = makeCtx({ '/orgs/acme/members': new Error('Not Found') });
    await orgMembersCheck.run(ctx);
    expect(passed).toHaveLength(0);
    expect(failed[0]).toMatchObject({ resourceType: 'organization', resourceId: 'acme' });
  });
});
