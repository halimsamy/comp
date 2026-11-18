import type { Prisma } from '@db';
import type { SeedRoleDefinition } from './types';

type Tx = Prisma.TransactionClient;

/**
 * PCI DSS 12.4.1 (service providers): executive management establishes
 * responsibility for protecting cardholder data and the PCI DSS compliance
 * programme. Seeded into the 5.3 Roles document only when PCI DSS is active.
 */
export const PCI_EXECUTIVE_OWNER_ROLE: SeedRoleDefinition = {
  roleKey: 'pci_executive_owner',
  name: 'PCI DSS Executive Owner',
  description:
    'The executive accountable for the protection of cardholder data and for the PCI DSS compliance programme (PCI DSS 12.4.1).',
  responsibilities:
    'Hold overall accountability for maintaining PCI DSS compliance; define the charter for the PCI DSS compliance programme and communicate it to executive management; review compliance status at least once every 12 months.',
  authorities:
    'Direct and resource the PCI DSS compliance programme and accept PCI-related risk on behalf of the organisation.',
  authorityGrantedBy: 'The executive office and the Board of Directors',
  requiredCompetence:
    'Executive authority over the cardholder data environment and an understanding of the organisation’s PCI DSS obligations as a service provider.',
};

export const PCI_EXECUTIVE_OWNER_KEY = PCI_EXECUTIVE_OWNER_ROLE.roleKey;

export function hasPciFramework(frameworkNames: string[]): boolean {
  return frameworkNames.some((name) => /\bpci\b/i.test(name));
}

/** Seed the PCI executive owner role once, never overwriting edits. */
export async function seedPciRoleIfMissing({
  tx,
  documentId,
  frameworkNames,
}: {
  tx: Tx;
  documentId: string;
  frameworkNames: string[];
}): Promise<void> {
  if (!hasPciFramework(frameworkNames)) return;
  const last = await tx.ismsRole.findFirst({
    where: { documentId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const { roleKey, ...text } = PCI_EXECUTIVE_OWNER_ROLE;
  await tx.ismsRole.createMany({
    data: [
      {
        documentId,
        roleKey,
        ...text,
        source: 'derived',
        derivedFrom: `seed:${roleKey}`,
        position: (last?.position ?? -1) + 1,
      },
    ],
    skipDuplicates: true, // @@unique([documentId, roleKey])
  });
}

export interface RoleCandidate {
  id: string;
  role: string; // comma-separated RBAC roles
  jobTitle: string | null;
}

const TITLE_RULES: Record<string, RegExp[]> = {
  top_management: [
    /\b(ceo|chief executive|founder|co-founder|managing director|president|general manager)\b/i,
  ],
  spo: [
    /\b(ciso|chief information security|security|privacy|compliance|grc)\b/i,
    /\b(cto|chief technology)\b/i,
  ],
  deputy_spo: [
    /\b(cto|chief technology|infrastructure|devops|head of engineering|vp engineering|engineering manager)\b/i,
  ],
};

function hasRbacRole(candidate: RoleCandidate, role: string): boolean {
  return candidate.role.split(',').some((value) => value.trim() === role);
}

function firstByTitle(
  candidates: RoleCandidate[],
  rules: RegExp[],
  exclude: Set<string>,
): string | undefined {
  for (const rule of rules) {
    const match = candidates.find(
      (candidate) =>
        !exclude.has(candidate.id) && rule.test(candidate.jobTitle ?? ''),
    );
    if (match) return match.id;
  }
  return undefined;
}

/**
 * Suggest one holder per governance role from job titles (the same titles the
 * org chart shows) and security-relevant RBAC roles. Internal Auditor is never
 * suggested: independence has to be a human decision.
 */
export function suggestRoleHolders({
  candidates,
}: {
  candidates: RoleCandidate[];
}): Partial<Record<string, string>> {
  const none = new Set<string>();
  const topManagement =
    firstByTitle(candidates, TITLE_RULES.top_management, none) ??
    candidates.find((candidate) => hasRbacRole(candidate, 'owner'))?.id;
  const spo =
    firstByTitle(candidates, TITLE_RULES.spo, none) ??
    candidates.find((candidate) => hasRbacRole(candidate, 'admin'))?.id;
  const deputy =
    candidates.length > 3
      ? firstByTitle(
          candidates,
          TITLE_RULES.deputy_spo,
          new Set([spo, topManagement].filter((id): id is string => !!id)),
        )
      : undefined;
  return {
    top_management: topManagement,
    spo,
    deputy_spo: deputy,
    [PCI_EXECUTIVE_OWNER_KEY]: topManagement,
  };
}

/**
 * Pre-fill seeded roles that have no holder yet with the suggested member.
 * Roles that already have any assignment are left alone, so a regenerate
 * never overrides the customer's choice.
 */
export async function assignSuggestedHolders({
  tx,
  documentId,
  organizationId,
}: {
  tx: Tx;
  documentId: string;
  organizationId: string;
}): Promise<void> {
  const [roles, candidates] = await Promise.all([
    tx.ismsRole.findMany({
      where: { documentId, roleKey: { not: null } },
      select: { id: true, roleKey: true, _count: { select: { assignments: true } } },
    }),
    tx.member.findMany({
      where: { organizationId, deactivated: false },
      select: { id: true, role: true, jobTitle: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const suggestions = suggestRoleHolders({ candidates });
  const data = roles
    .filter((role) => role._count.assignments === 0 && role.roleKey)
    .map((role) => ({ role, memberId: suggestions[role.roleKey ?? ''] }))
    .filter((row): row is { role: (typeof roles)[number]; memberId: string } =>
      Boolean(row.memberId),
    )
    .map(({ role, memberId }) => ({ roleId: role.id, documentId, memberId }));
  if (data.length === 0) return;
  await tx.ismsRoleAssignment.createMany({ data, skipDuplicates: true });
}
