jest.mock('@db', () => ({
  db: {
    evidenceSubmission: { findMany: jest.fn() },
    member: { findMany: jest.fn() },
    accessSystem: { findMany: jest.fn(), create: jest.fn() },
    accessSystemRole: { upsert: jest.fn() },
  },
}));

import { db } from '@db';
import { applyRbacImport, previewRbacImport, systemGroupKey } from './access-rbac-import';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';
const matrix = [
  { system: 'AWS Production Account', roleName: 'Administrator', approvedBy: 'Jane Doe, CTO', lastReviewed: '2026-06-01' },
  { system: 'AWS production account (service account)', roleName: 'Deployer', permissionsScope: 'ECS deploy' },
  { system: 'Bank portal', roleName: 'Viewer', approvedBy: 'Unknown Person' },
];

describe('RBAC matrix import (#172)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked(db.evidenceSubmission.findMany).mockResolvedValue([{ data: { matrixRows: matrix } }]);
    mocked(db.member.findMany).mockResolvedValue([
      { id: 'mem_jane', user: { name: 'Jane Doe', email: 'jane@acme.com' } },
    ]);
    mocked(db.accessSystem.findMany).mockResolvedValue([{ id: 'asy_bank', name: 'Bank Portal' }]);
    mocked(db.accessSystem.create).mockResolvedValue({ id: 'asy_aws', name: 'AWS Production Account' });
  });

  it('groups system names that differ only by case or a (...) suffix', async () => {
    expect(systemGroupKey('AWS production account (service account)')).toBe('aws production account');
    const preview = await previewRbacImport(ORG);
    expect(db.evidenceSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, formType: 'rbac_matrix' }, take: 1 }),
    );
    expect(preview).toEqual([
      {
        name: 'AWS Production Account',
        sources: ['AWS Production Account', 'AWS production account (service account)'],
        roleCount: 2,
        merged: true,
      },
      { name: 'Bank portal', sources: ['Bank portal'], roleCount: 1, merged: false },
    ]);
  });

  it('creates missing systems, reuses existing ones and upserts approved roles', async () => {
    const result = await applyRbacImport({
      organizationId: ORG,
      groups: [
        { name: 'AWS Production Account', sources: ['AWS Production Account', 'AWS production account (service account)'] },
        { name: 'Bank portal', sources: ['Bank portal'] },
      ],
    });
    expect(result).toEqual({ systems: 1, roles: 3 });
    expect(db.accessSystem.create).toHaveBeenCalledTimes(1);
    const upserts = mocked(db.accessSystemRole.upsert).mock.calls.map((c) => c[0]);
    expect(upserts[0].create).toMatchObject({
      organizationId: ORG,
      systemKey: 'manual:asy_aws',
      name: 'Administrator',
      isPrivileged: true,
      approvedById: 'mem_jane',
    });
    expect(upserts[1].create).toMatchObject({ name: 'Deployer', isPrivileged: false, permissionsScope: 'ECS deploy' });
    // An approver who is not a member keeps the name from the form.
    expect(upserts[2].create).toMatchObject({
      systemKey: 'manual:asy_bank',
      approvedById: null,
      approvedByName: 'Unknown Person',
    });
  });

  it('refuses to import when there is no matrix', async () => {
    mocked(db.evidenceSubmission.findMany).mockResolvedValue([]);
    await expect(applyRbacImport({ organizationId: ORG, groups: [] })).rejects.toThrow('No RBAC matrix rows');
  });
});
