/**
 * Organization Members (account inventory)
 * Lists every member of the GitHub organizations behind the selected repos,
 * with their org role and 2FA status, for user access reviews.
 * Emits the standard account-row contract (one 'user' row per member).
 *
 * @see https://docs.github.com/en/rest/orgs/members#list-organization-members
 */

import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { parseRepoBranches, targetReposVariable } from '../variables';

interface GitHubOrgMember {
  login: string;
  id: number;
  html_url: string;
  type?: string;
}

export const orgMembersCheck: IntegrationCheck = {
  id: 'org_members',
  name: 'Organization Members',
  description: 'List GitHub organization members with their role and 2FA status for access reviews',
  service: 'code-security',
  taskMapping: TASK_TEMPLATES.employeeAccess,
  variables: [targetReposVariable],

  run: async (ctx) => {
    const targetRepos = ctx.variables.target_repos as string[] | undefined;
    const orgs = Array.from(
      new Set(
        (targetRepos ?? [])
          .map((value) => parseRepoBranches(value).repo.split('/')[0])
          .filter((owner): owner is string => Boolean(owner)),
      ),
    );
    if (orgs.length === 0) {
      ctx.log('No repositories selected — no organizations to list');
      return;
    }

    for (const org of orgs) {
      const slug = encodeURIComponent(org);
      const checkedAt = new Date().toISOString();
      let members: GitHubOrgMember[];
      let admins: GitHubOrgMember[];
      try {
        [members, admins] = await Promise.all([
          ctx.fetchAllPages<GitHubOrgMember>(`/orgs/${slug}/members`),
          ctx.fetchAllPages<GitHubOrgMember>(`/orgs/${slug}/members?role=admin`),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.fail({
          title: `Cannot list members of ${org}`,
          description: `GitHub did not return the organization members: ${message}`,
          resourceType: 'organization',
          resourceId: org,
          severity: 'low',
          remediation: 'Reconnect GitHub with an account that can read the organization members.',
        });
        continue;
      }

      // The 2FA filter is owner-only; without it MFA stays unknown rather than "off".
      let without2fa: Set<string> | null = null;
      try {
        const rows = await ctx.fetchAllPages<GitHubOrgMember>(
          `/orgs/${slug}/members?filter=2fa_disabled`,
        );
        without2fa = new Set(rows.map((m) => m.login));
      } catch {
        ctx.log(`2FA status unavailable for ${org} (needs an organization owner)`);
      }

      const adminLogins = new Set(admins.map((m) => m.login));
      for (const member of members) {
        const isAdmin = adminLogins.has(member.login);
        ctx.pass({
          title: 'GitHub organization member',
          resourceType: 'user',
          resourceId: `${org}/${member.login}`,
          description: `@${member.login} is ${isAdmin ? 'an owner' : 'a member'} of ${org}`,
          evidence: {
            accountName: member.login,
            username: member.login,
            organization: org,
            type: member.type === 'Bot' ? 'service' : 'human',
            status: 'active',
            roles: [isAdmin ? 'owner' : 'member'],
            isAdmin,
            ...(without2fa && { mfa: !without2fa.has(member.login) }),
            profileUrl: member.html_url,
            checkedAt,
          },
        });
      }
      ctx.log(`${org}: ${members.length} members (${adminLogins.size} owners)`);
    }
  },
};
