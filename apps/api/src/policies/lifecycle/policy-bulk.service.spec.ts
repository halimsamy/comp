import { PolicyBulkService, pickVersionToSubmit } from './policy-bulk.service';
import { PolicyBulkController } from './policy-bulk.controller';
import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import type { PoliciesService } from '../policies.service';

jest.mock('@db', () => ({
  db: {
    policy: { findMany: jest.fn(), updateMany: jest.fn() },
    member: { findFirst: jest.fn() },
  },
}));
jest.mock('../../utils/org-participation', () => ({
  isMemberOrgParticipant: jest.fn(async () => true),
}));
jest.mock('../../auth/auth.server', () => ({ auth: { api: {} } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('../policies.service', () => ({ PoliciesService: class {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');

const base = {
  pendingVersionId: null,
  lastPublishedAt: null,
  currentVersionId: 'pv_1',
  currentVersion: { version: 1 },
  versions: [{ id: 'pv_1', version: 1 }],
};

describe('pickVersionToSubmit', () => {
  it('submits the current draft of a never-published policy', () => {
    expect(pickVersionToSubmit(base)).toEqual({ versionId: 'pv_1' });
  });

  it('submits the newest version above the published one', () => {
    expect(
      pickVersionToSubmit({
        ...base,
        lastPublishedAt: new Date(),
        versions: [{ id: 'pv_3', version: 3 }],
      }),
    ).toEqual({ versionId: 'pv_3' });
  });

  it('skips pending policies and published ones without a new version', () => {
    expect(pickVersionToSubmit({ ...base, pendingVersionId: 'pv_1' })).toEqual({
      reason: 'Already waiting for approval',
    });
    expect(pickVersionToSubmit({ ...base, lastPublishedAt: new Date() })).toEqual({
      reason: 'No new version to approve',
    });
  });
});

describe('PolicyBulkService', () => {
  const policiesService = { submitForApproval: jest.fn() };
  const service = new PolicyBulkService(policiesService as unknown as PoliciesService);

  beforeEach(() => jest.clearAllMocks());

  it('submits each policy separately and reports failures as skipped', async () => {
    db.policy.findMany.mockResolvedValue([
      { ...base, id: 'pol_a', name: 'A' },
      { ...base, id: 'pol_b', name: 'B' },
      { ...base, id: 'pol_c', name: 'C', pendingVersionId: 'pv_9' },
    ]);
    policiesService.submitForApproval
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Set a policy owner before submitting it for approval'));

    const result = await service.submitForApproval({
      organizationId: 'org_1',
      policyIds: ['pol_a', 'pol_b', 'pol_c'],
      approverId: 'mem_appr',
      actorMemberId: 'mem_me',
    });

    expect(db.policy.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org_1' });
    expect(policiesService.submitForApproval).toHaveBeenCalledWith(
      'pol_a',
      'pv_1',
      'org_1',
      { approverId: 'mem_appr' },
      'mem_me',
    );
    expect(result.submitted).toBe(1);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'Set a policy owner before submitting it for approval',
      'Already waiting for approval',
    ]);
  });

  it('sets the owner only on policies of the organization', async () => {
    db.member.findFirst.mockResolvedValue({ user: { role: null } });
    db.policy.updateMany.mockResolvedValue({ count: 2 });
    await expect(
      service.setOwner({ organizationId: 'org_1', policyIds: ['pol_a', 'pol_b'], ownerId: 'mem_o' }),
    ).resolves.toEqual({ updated: 2 });
    expect(db.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_o',
      organizationId: 'org_1',
      deactivated: false,
    });
    expect(db.policy.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['pol_a', 'pol_b'] }, organizationId: 'org_1' },
      data: { assigneeId: 'mem_o' },
    });
  });

  it('rejects owners outside the organization', async () => {
    db.member.findFirst.mockResolvedValue(null);
    await expect(
      service.setOwner({ organizationId: 'org_1', policyIds: ['pol_a'], ownerId: 'mem_x' }),
    ).rejects.toThrow(/not an active member/);
    expect(db.policy.updateMany).not.toHaveBeenCalled();
  });

  it.each(['submitForApproval', 'setOwner'] as const)('%s requires policy:update', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PolicyBulkController.prototype[method])).toEqual([
      { resource: 'policy', actions: ['update'] },
    ]);
  });
});
