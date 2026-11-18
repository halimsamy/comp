import {
  GetLoginProfileCommand,
  IAMClient,
  ListAttachedGroupPoliciesCommand,
  ListAttachedUserPoliciesCommand,
  ListGroupsForUserCommand,
  ListMFADevicesCommand,
  ListUsersCommand,
  type User,
} from '@aws-sdk/client-iam';
import { TASK_TEMPLATES } from '../../../task-mappings';
import type { CheckContext, IntegrationCheck } from '../../../types';
import { awsAccountIdFromCtx, resolveAwsSessionOrFail, toReadFailure } from './shared';

const ADMIN_POLICY = /\/AdministratorAccess$/;

/** The standard account-row evidence for one IAM user (pure, unit-tested). */
export function iamUserAccountEvidence({
  user,
  awsAccountId,
  hasConsoleLogin,
  mfaDeviceCount,
  groups,
  policyArns,
  checkedAt,
}: {
  user: Pick<User, 'UserName' | 'Arn' | 'CreateDate' | 'PasswordLastUsed'>;
  awsAccountId: string | null;
  hasConsoleLogin: boolean;
  mfaDeviceCount: number;
  groups: string[];
  policyArns: string[];
  checkedAt: string;
}) {
  const userName = user.UserName ?? '';
  return {
    accountName: userName,
    ...(userName.includes('@') && { email: userName.toLowerCase() }),
    awsAccountId,
    arn: user.Arn,
    // Users without a console password are programmatic (service) identities.
    type: hasConsoleLogin ? 'human' : 'service',
    status: 'active',
    roles: groups,
    policies: policyArns.map((arn) => arn.split('/').pop() ?? arn),
    isAdmin: policyArns.some((arn) => ADMIN_POLICY.test(arn)),
    // MFA only protects console sign-in; unknown for programmatic users.
    ...(hasConsoleLogin && { mfa: mfaDeviceCount > 0 }),
    createdAt: user.CreateDate?.toISOString(),
    lastLoginAt: user.PasswordLastUsed?.toISOString(),
    checkedAt,
  };
}

/**
 * IAM users (account inventory) — one 'user' row per IAM user with groups,
 * admin policy, console MFA and last console sign-in, for access reviews.
 */
export const iamUsersCheck: IntegrationCheck = {
  id: 'aws-iam-users',
  name: 'IAM — user accounts',
  description: 'List IAM users with groups, admin access, MFA and last sign-in for access reviews.',
  service: 'iam-analyzer',
  taskMapping: TASK_TEMPLATES.employeeAccess,
  run: async (ctx: CheckContext) => {
    const session = await resolveAwsSessionOrFail(ctx);
    if (!session) return;
    const iam = new IAMClient({
      region: session.regions[0],
      credentials: session.credentials,
      maxAttempts: 5,
    });
    const awsAccountId = awsAccountIdFromCtx(ctx);
    const checkedAt = new Date().toISOString();

    try {
      const users: User[] = [];
      let marker: string | undefined;
      do {
        const page = await iam.send(new ListUsersCommand({ Marker: marker }));
        users.push(...(page.Users ?? []));
        marker = page.IsTruncated ? page.Marker : undefined;
      } while (marker);

      const groupPolicies = new Map<string, string[]>();
      // shortcut: sequential per-user reads (4-5 calls each); batch them if accounts grow past a few hundred users.
      for (const user of users) {
        const UserName = user.UserName;
        const [mfa, groups, attached, hasConsoleLogin] = await Promise.all([
          iam.send(new ListMFADevicesCommand({ UserName })),
          iam.send(new ListGroupsForUserCommand({ UserName })),
          iam.send(new ListAttachedUserPoliciesCommand({ UserName })),
          iam
            .send(new GetLoginProfileCommand({ UserName }))
            .then(() => true)
            .catch((err: unknown) => {
              if (err instanceof Error && /NoSuchEntity/i.test(err.name)) return false;
              throw err;
            }),
        ]);
        const groupNames = (groups.Groups ?? []).map((g) => g.GroupName ?? '').filter(Boolean);
        const policyArns = (attached.AttachedPolicies ?? []).map((p) => p.PolicyArn ?? '');
        for (const groupName of groupNames) {
          if (!groupPolicies.has(groupName)) {
            const res = await iam.send(
              new ListAttachedGroupPoliciesCommand({ GroupName: groupName }),
            );
            groupPolicies.set(
              groupName,
              (res.AttachedPolicies ?? []).map((p) => p.PolicyArn ?? ''),
            );
          }
          policyArns.push(...(groupPolicies.get(groupName) ?? []));
        }
        const evidence = iamUserAccountEvidence({
          user,
          awsAccountId,
          hasConsoleLogin,
          mfaDeviceCount: mfa.MFADevices?.length ?? 0,
          groups: groupNames,
          policyArns,
          checkedAt,
        });
        ctx.pass({
          title: 'IAM user',
          resourceType: 'user',
          resourceId: evidence.email ?? user.Arn ?? UserName ?? 'unknown',
          description: `${UserName} (${evidence.type}${evidence.isAdmin ? ', administrator' : ''})${awsAccountId ? ` in AWS account ${awsAccountId}` : ''}`,
          evidence,
        });
      }
      ctx.log(`IAM users: ${users.length}`);
    } catch (err) {
      const failure = toReadFailure(err);
      ctx.fail({
        title: 'Could not list IAM users',
        description: `IAM users could not be read (${failure.error}), so the AWS account inventory is incomplete.`,
        resourceType: 'aws-account',
        resourceId: 'account',
        severity: 'low',
        remediation:
          'Grant iam:ListUsers, iam:ListMFADevices, iam:ListGroupsForUser, iam:ListAttachedUserPolicies, iam:ListAttachedGroupPolicies and iam:GetLoginProfile to the integration role.',
        evidence: { readError: failure.error },
      });
    }
  },
};
