import { db } from '@db';
import { createAccessAccountsService } from '../../../access-reviews/access-accounts.service';
import type { InventoryAccount } from '../../../access-reviews/access-accounts.lib';
import {
  fingerprintOf,
  listIssue,
  type NativeEvidenceRule,
  type RuleResult,
} from '../native-evidence.types';

type Row = { system: string; account: InventoryAccount };

async function loadAccounts(organizationId: string): Promise<Row[]> {
  const systems = await createAccessAccountsService().listAllAccounts(organizationId);
  return systems.flatMap(({ system, accounts }) =>
    accounts.filter((a) => a.status === 'active').map((account) => ({ system: system.name, account })),
  );
}

const label = ({ system, account }: Row) => `${account.email ?? account.name} (${system})`;
const isHuman = ({ account }: Row) => !account.isServiceAccount && account.type !== 'service';

function accountsTable({ rows, extra }: { rows: Row[]; extra: { header: string; value: (r: Row) => string } }) {
  return {
    headers: ['System', 'Account', 'Owner', 'Roles', extra.header],
    rows: rows.map((r) => [
      r.system,
      r.account.email ?? r.account.name,
      r.account.owner?.name ?? (r.account.justification ? `Service: ${r.account.justification}` : '—'),
      r.account.roles.join(', ') || '—',
      extra.value(r),
    ]),
  };
}

/** ISO 27001 A.5.15, A.5.18; PCI DSS 7.2.1, 7.2.2, 8.2.2: owned accounts with approved roles. */
export const employeeAccessRule: NativeEvidenceRule = {
  key: 'access_employee_access',
  module: 'Access',
  title: 'Every active account has an owner or a service justification, and no account has an unapproved role',
  reference: 'ISO/IEC 27001:2022 A.5.15, A.5.18, A.8.2; PCI DSS v4.0.1 7.2.1, 7.2.2, 8.2.2',
  path: '/people?tab=access',
  async evaluate({ organizationId }) {
    const rows = await loadAccounts(organizationId);
    const unowned = rows.filter((r) => r.account.flags.includes('unmapped'));
    const unapproved = rows.filter(
      (r) => r.account.flags.includes('role_not_approved') || r.account.flags.includes('admin_role_unapproved'),
    );
    return {
      holds: rows.length > 0 && unowned.length === 0 && unapproved.length === 0,
      summary: `${rows.length} active accounts; ${unowned.length} without an owner, ${unapproved.length} with an unapproved role`,
      issues: [
        ...(rows.length ? [] : ['Connect your identity provider or import accounts in People > Access.']),
        ...listIssue({ label: 'No owner or justification', names: unowned.map(label) }),
        ...listIssue({ label: 'Role not approved', names: unapproved.map(label) }),
      ],
      fingerprint: fingerprintOf(rows.map((r) => [r.system, r.account.accountId, r.account.flags])),
      sections: [
        {
          heading: 'Account inventory',
          emptyText: 'No accounts found.',
          ...(rows.length > 0 && {
            table: accountsTable({ rows, extra: { header: 'Exceptions', value: (r) => r.account.flags.join(', ') || '—' } }),
          }),
        },
      ],
    };
  },
};

/** ISO 27001 A.8.5; PCI DSS 8.4.2, 8.4.3: every active human account on a connected system has MFA. */
export const mfaRule: NativeEvidenceRule = {
  key: 'access_mfa',
  module: 'Access',
  title: 'Every active human account on your connected systems has MFA turned on',
  reference: 'ISO/IEC 27001:2022 A.8.5; PCI DSS v4.0.1 8.4.1, 8.4.2, 8.4.3',
  path: '/people?tab=access',
  async evaluate({ organizationId }) {
    // Systems that do not report MFA (null) cannot prove it either way.
    const rows = (await loadAccounts(organizationId)).filter((r) => isHuman(r) && r.account.mfaEnabled !== null);
    const missing = rows.filter((r) => r.account.mfaEnabled === false);
    return {
      holds: rows.length > 0 && missing.length === 0,
      summary: `${rows.length - missing.length} of ${rows.length} human accounts have MFA`,
      issues: [
        ...(rows.length ? [] : ['Connect an identity provider that reports MFA (e.g. Google Workspace) in Integrations.']),
        ...listIssue({ label: 'No MFA', names: missing.map(label) }),
      ],
      fingerprint: fingerprintOf(rows.map((r) => [r.system, r.account.accountId, r.account.mfaEnabled])),
      sections: [
        {
          heading: 'MFA by account',
          emptyText: 'No system reports MFA status.',
          ...(rows.length > 0 && {
            table: accountsTable({ rows, extra: { header: 'MFA', value: (r) => (r.account.mfaEnabled ? 'On' : 'Off') } }),
          }),
        },
        ...(missing.length ? [{ heading: 'Exceptions', bullets: missing.map(label) }] : []),
      ],
    };
  },
};

/** PCI DSS 8.2.8 caps idle sessions at 15 minutes. */
export const MAX_IDLE_MINUTES = 15;

/** PCI DSS 8.2.8; ISO 27001 A.8.5: Comp AI sessions end after at most 15 idle minutes (#12). */
export const sessionPolicyRule: NativeEvidenceRule = {
  key: 'security_session_timeout',
  module: 'Settings',
  title: `Idle sessions sign out after ${MAX_IDLE_MINUTES} minutes or less`,
  reference: 'PCI DSS v4.0.1 8.2.8; ISO/IEC 27001:2022 A.8.5',
  path: '/settings/security',
  async evaluate({ organizationId }) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { sessionIdleTimeoutMinutes: true },
    });
    const minutes = org?.sessionIdleTimeoutMinutes ?? null;
    const holds = minutes !== null && minutes <= MAX_IDLE_MINUTES;
    return {
      holds,
      summary: minutes === null ? 'No idle timeout set' : `Idle timeout ${minutes} minutes`,
      issues: holds ? [] : [`Set the idle timeout to ${MAX_IDLE_MINUTES} minutes or less in Settings > Security.`],
      fingerprint: fingerprintOf(['idle', minutes]),
      sections: [
        { heading: 'Session policy', keyValues: [{ label: 'Idle timeout', value: minutes === null ? 'Not set' : `${minutes} minutes` }] },
      ],
    };
  },
};

/** Several rules proving one task: met only when all are met. */
export function allOf({ key, title, rules }: { key: string; title: string; rules: NativeEvidenceRule[] }): NativeEvidenceRule {
  return {
    key,
    title,
    module: rules[0].module,
    reference: [...new Set(rules.map((r) => r.reference))].join('; '),
    path: rules[0].path,
    async evaluate(ctx) {
      const results: RuleResult[] = await Promise.all(rules.map((r) => r.evaluate(ctx)));
      return {
        holds: results.every((r) => r.holds),
        summary: results.map((r) => r.summary).join(' · '),
        issues: results.flatMap((r) => r.issues),
        fingerprint: fingerprintOf(results.map((r) => r.fingerprint)),
        sections: results.flatMap((r) => r.sections),
      };
    },
  };
}

/** The 2FA task covers MFA and the session settings (PCI DSS 8.2.8, 8.4). */
export const authenticationRule = allOf({
  key: 'access_authentication',
  title: 'Every human account has MFA, and idle sessions sign out within 15 minutes',
  rules: [mfaRule, sessionPolicyRule],
});
