import type { Prisma } from '@db';
import {
  assignSuggestedHolders,
  hasPciFramework,
  seedPciRoleIfMissing,
  suggestRoleHolders,
} from './role-automation';
import { roleValidationMessages } from './roles';

const spare = [
  { id: 'cto', role: 'owner,employee', jobTitle: 'CTO' },
  { id: 'sales', role: 'employee', jobTitle: 'Head of Sales' },
  { id: 'sec', role: 'admin,employee', jobTitle: 'Head of Infrastructure and Security' },
  { id: 'ceo', role: 'admin,employee', jobTitle: 'CEO' },
  { id: 'eng', role: 'employee', jobTitle: 'Software Engineer' },
];

describe('suggestRoleHolders', () => {
  it('maps job titles to governance roles', () => {
    expect(suggestRoleHolders({ candidates: spare })).toEqual({
      top_management: 'ceo',
      spo: 'sec',
      deputy_spo: 'cto',
      pci_executive_owner: 'ceo',
    });
  });

  it('falls back to owner and admin RBAC roles when titles are missing', () => {
    const result = suggestRoleHolders({
      candidates: [
        { id: 'a', role: 'admin', jobTitle: null },
        { id: 'o', role: 'owner', jobTitle: null },
      ],
    });
    expect(result.top_management).toBe('o');
    expect(result.spo).toBe('a');
    expect(result.deputy_spo).toBeUndefined(); // 1-3 people: no deputy
  });
});

describe('hasPciFramework', () => {
  it('detects PCI framework names', () => {
    expect(hasPciFramework(['ISO 27001', 'PCI DSS Level 1'])).toBe(true);
    expect(hasPciFramework(['ISO 27001', 'SOC 2'])).toBe(false);
  });
});

describe('seedPciRoleIfMissing', () => {
  const makeTx = () => ({
    ismsRole: {
      findFirst: jest.fn().mockResolvedValue({ position: 3 }),
      createMany: jest.fn(),
    },
  });

  it('seeds the PCI executive owner after existing roles when PCI is active', async () => {
    const tx = makeTx();
    await seedPciRoleIfMissing({
      tx: tx as unknown as Prisma.TransactionClient,
      documentId: 'doc_1',
      frameworkNames: ['PCI DSS'],
    });
    const call = tx.ismsRole.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      roleKey: 'pci_executive_owner',
      position: 4,
      derivedFrom: 'seed:pci_executive_owner',
    });
  });

  it('does nothing without PCI', async () => {
    const tx = makeTx();
    await seedPciRoleIfMissing({
      tx: tx as unknown as Prisma.TransactionClient,
      documentId: 'doc_1',
      frameworkNames: ['ISO 27001'],
    });
    expect(tx.ismsRole.createMany).not.toHaveBeenCalled();
  });
});

function makeTx({
  roles,
  answers = {},
}: {
  roles: Array<{ id: string; roleKey: string; _count: { assignments: number } }>;
  answers?: unknown;
}) {
  return {
    ismsRole: { findMany: jest.fn().mockResolvedValue(roles) },
    member: { findMany: jest.fn().mockResolvedValue(spare) },
    ismsDocument: { findFirst: jest.fn().mockResolvedValue({ frameworkId: 'fw_1' }) },
    ismsProfile: { findUnique: jest.fn().mockResolvedValue({ answers }) },
    ismsRoleAssignment: { createMany: jest.fn() },
  };
}

const emptyDeputy = [{ id: 'r_dep', roleKey: 'deputy_spo', _count: { assignments: 0 } }];

describe('assignSuggestedHolders', () => {
  it('fills only roles that have no holder yet', async () => {
    const tx = makeTx({
      roles: [
        { id: 'r_top', roleKey: 'top_management', _count: { assignments: 0 } },
        { id: 'r_spo', roleKey: 'spo', _count: { assignments: 1 } },
        { id: 'r_ia', roleKey: 'internal_auditor', _count: { assignments: 0 } },
      ],
    });
    await assignSuggestedHolders({
      tx: tx as unknown as Prisma.TransactionClient,
      documentId: 'doc_1',
      organizationId: 'org_1',
    });
    expect(tx.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', deactivated: false } }),
    );
    expect(tx.ismsRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r_top', documentId: 'doc_1', memberId: 'ceo' }],
      skipDuplicates: true,
    });
  });

  it('suggests the legacy wizard Deputy SPO for an empty 5.3 deputy role', async () => {
    const tx = makeTx({
      roles: emptyDeputy,
      answers: { deputySpo: { memberId: 'eng', toBeNamed: false } },
    });
    await assignSuggestedHolders({
      tx: tx as unknown as Prisma.TransactionClient,
      documentId: 'doc_1',
      organizationId: 'org_1',
    });
    expect(tx.ismsDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc_1', organizationId: 'org_1' },
      select: { frameworkId: true },
    });
    expect(tx.ismsRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r_dep', documentId: 'doc_1', memberId: 'eng' }],
      skipDuplicates: true,
    });
  });

  it('ignores a legacy wizard deputy who is no longer an active member', async () => {
    const tx = makeTx({
      roles: emptyDeputy,
      answers: { deputySpo: { memberId: 'gone', toBeNamed: false } },
    });
    await assignSuggestedHolders({
      tx: tx as unknown as Prisma.TransactionClient,
      documentId: 'doc_1',
      organizationId: 'org_1',
    });
    // Falls back to the job-title suggestion (the CTO).
    expect(tx.ismsRoleAssignment.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r_dep', documentId: 'doc_1', memberId: 'cto' }],
      skipDuplicates: true,
    });
  });
});

describe('roleValidationMessages with the PCI role', () => {
  const baseRole = { auditRoute: null, assignments: [{ memberId: 'm1' }] };
  const roles = [
    { ...baseRole, roleKey: 'top_management', name: 'Top Management' },
    { ...baseRole, roleKey: 'spo', name: 'SPO' },
    { ...baseRole, roleKey: 'deputy_spo', name: 'Deputy' },
    { ...baseRole, roleKey: 'internal_auditor', name: 'IA', auditRoute: 'external', auditFirmName: 'Firm', auditEvidenceRef: 'LA-1' },
  ];

  it('needs a holder for the PCI role once it exists', () => {
    const messages = roleValidationMessages({
      roles: [...roles, { roleKey: 'pci_executive_owner', name: 'PCI DSS Executive Owner', auditRoute: null, assignments: [] }],
      memberCount: 5,
      activeMemberIds: new Set(['m1']),
    });
    expect(messages).toEqual(['PCI DSS Executive Owner needs at least one assigned member.']);
  });

  it('does not require the PCI role for non-PCI organizations', () => {
    expect(
      roleValidationMessages({ roles, memberCount: 5, activeMemberIds: new Set(['m1']) }),
    ).toEqual([]);
  });
});
