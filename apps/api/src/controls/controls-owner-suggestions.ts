import { db } from '@db';
import { controlSummarySelect, groupRequirementsByFramework } from './control-requirements';

export interface RoleHolder {
  roleKey: string | null;
  roleName: string;
  memberId: string;
  memberName: string;
}

type RoleMatcher = { key?: string; name?: RegExp };

const SPO: RoleMatcher = { key: 'spo' };
const TOP: RoleMatcher = { key: 'top_management' };
const DEPUTY: RoleMatcher = { key: 'deputy_spo' };
const PCI_EXEC: RoleMatcher = { key: 'pci_executive_owner' };
const HR: RoleMatcher = { name: /\b(hr|human resources|people)\b/i };
const TECH: RoleMatcher = { name: /\b(cto|technology|engineering|it manager)\b/i };

/**
 * Which ISMS role should own a control, from its first requirement code.
 * Earlier entries win; the SPO (ISMS manager) is the last resort.
 * - ISO A.5 organizational -> SPO; A.6 people -> HR; A.7 physical -> SPO;
 *   A.8 technological -> CTO / deputy SPO; clause 5 leadership -> top management.
 * - PCI 12 policies and program -> PCI executive owner; other PCI -> CTO / deputy SPO.
 */
export function rolePreferenceForCode({
  frameworkName,
  code,
}: {
  frameworkName: string;
  code: string;
}): RoleMatcher[] {
  if (/iso/i.test(frameworkName)) {
    if (/^A\.6\./.test(code)) return [HR, TOP, SPO];
    if (/^A\.8\./.test(code)) return [TECH, DEPUTY, SPO];
    if (/^5(\.|$)/.test(code)) return [TOP, SPO];
    return [SPO];
  }
  if (/pci/i.test(frameworkName)) {
    if (/^12\./.test(code)) return [PCI_EXEC, SPO];
    return [TECH, DEPUTY, SPO];
  }
  return [SPO];
}

export function pickRoleHolder({
  frameworkName,
  code,
  holders,
}: {
  frameworkName: string;
  code: string;
  holders: RoleHolder[];
}): RoleHolder | null {
  for (const matcher of rolePreferenceForCode({ frameworkName, code })) {
    const match = holders.find((h) =>
      matcher.key ? h.roleKey === matcher.key : !!matcher.name?.test(h.roleName),
    );
    if (match) return match;
  }
  return null;
}

/** ISMS role holders (active members only) for the organization. */
export async function loadRoleHolders(organizationId: string): Promise<RoleHolder[]> {
  const roles = await db.ismsRole.findMany({
    where: { document: { organizationId } },
    select: { roleKey: true, name: true, assignments: { select: { memberId: true } } },
    orderBy: { position: 'asc' },
  });
  const memberIds = [...new Set(roles.flatMap((r) => r.assignments.map((a) => a.memberId)))];
  const members = await db.member.findMany({
    where: { id: { in: memberIds }, organizationId, deactivated: false },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const nameById = new Map(members.map((m) => [m.id, m.user.name || m.user.email]));
  return roles.flatMap((role) =>
    role.assignments
      .filter((a) => nameById.has(a.memberId))
      .map((a) => ({
        roleKey: role.roleKey,
        roleName: role.name,
        memberId: a.memberId,
        memberName: nameById.get(a.memberId) ?? '',
      })),
  );
}

/** Suggested owner per control that has no active owner, for the confirm table. */
export async function suggestControlOwners(organizationId: string) {
  const [holders, controls] = await Promise.all([
    loadRoleHolders(organizationId),
    db.control.findMany({
      where: { organizationId, archivedAt: null },
      select: controlSummarySelect,
      orderBy: { name: 'asc' },
    }),
  ]);
  if (holders.length === 0) return { data: [], count: 0, hasRoles: false };

  const data = controls.flatMap((control) => {
    if (control.owner && !control.owner.deactivated) return [];
    const frameworks = groupRequirementsByFramework({ requirementsMapped: control.requirementsMapped });
    // ISO codes first: their themes map most directly to ISMS roles.
    const ordered = [...frameworks].sort(
      (a, b) => Number(/iso/i.test(b.frameworkName)) - Number(/iso/i.test(a.frameworkName)),
    );
    const frameworkName = ordered[0]?.frameworkName ?? '';
    const code = ordered[0]?.requirements[0]?.identifier ?? '';
    const holder = pickRoleHolder({ frameworkName, code, holders });
    if (!holder) return [];
    return [
      {
        controlId: control.id,
        controlName: control.name,
        code,
        memberId: holder.memberId,
        memberName: holder.memberName,
        roleName: holder.roleName,
      },
    ];
  });
  return { data, count: data.length, hasRoles: true };
}
