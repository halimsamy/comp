import { PoliciesService } from './policies.service';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { PolicyPdfRendererService } from '../trust-portal/policy-pdf-renderer.service';
import type { TimelinesService } from '../timelines/timelines.service';

const tx = {
  policy: { create: jest.fn(), update: jest.fn() },
  policyVersion: { create: jest.fn() },
};
jest.mock('@db', () => ({
  db: {
    policy: { findUnique: jest.fn() },
    member: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  PolicyStatus: { draft: 'draft', published: 'published', needs_review: 'needs_review' },
  Prisma: {},
}));
jest.mock('../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));
jest.mock('../utils/org-participation', () => ({
  isMemberOrgParticipant: jest.fn(async () => true),
}));
jest.mock('../frameworks/frameworks-timeline.helper', () => ({
  checkAutoCompletePhases: jest.fn(async () => undefined),
}));
jest.mock('./lifecycle/policy-approval-notifier', () => ({ notifyPolicyApproval: jest.fn() }));
jest.mock('../timelines/timelines.service', () => ({ TimelinesService: class {} }));
jest.mock('../attachments/attachments.service', () => ({ AttachmentsService: class {} }));
jest.mock('../trust-portal/policy-pdf-renderer.service', () => ({ PolicyPdfRendererService: class {} }));
jest.mock('../app/s3', () => ({ BUCKET_NAME: 'b', s3Client: {}, getSignedUrl: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db');

describe('PoliciesService ownership defaults', () => {
  const service = new PoliciesService(
    {} as AttachmentsService,
    {} as PolicyPdfRendererService,
    {} as TimelinesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.policy.create.mockResolvedValue({ id: 'pol_1' });
    tx.policyVersion.create.mockResolvedValue({ id: 'pv_1' });
    tx.policy.update.mockResolvedValue({ id: 'pol_1', name: 'New' });
  });

  it('makes the creator the owner and defaults review frequency to yearly', async () => {
    db.member.findFirst.mockResolvedValue({ id: 'mem_me', department: 'it', user: { role: null } });

    await service.create('org_1', { name: 'New', content: [] }, 'mem_me');

    expect(db.member.findFirst.mock.calls[0][0].where).toEqual({
      id: 'mem_me',
      organizationId: 'org_1',
      deactivated: false,
    });
    expect(tx.policy.create.mock.calls[0][0].data).toMatchObject({
      assigneeId: 'mem_me',
      frequency: 'yearly',
      department: 'it',
      organizationId: 'org_1',
    });
  });

  it('keeps an explicit owner and frequency', async () => {
    db.member.findFirst.mockResolvedValue({ id: 'mem_x', department: 'none', user: { role: null } });

    await service.create(
      'org_1',
      { name: 'New', content: [], assigneeId: 'mem_owner', frequency: 'quarterly' as never },
      'mem_me',
    );

    const data = tx.policy.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ assigneeId: 'mem_owner', frequency: 'quarterly' });
    expect(data.department).toBeUndefined();
  });

  it('rejects an owner from another organization', async () => {
    db.member.findFirst.mockResolvedValueOnce({ id: 'mem_me', department: 'it' }).mockResolvedValueOnce(null);
    await expect(
      service.create('org_1', { name: 'New', content: [], assigneeId: 'mem_other_org' }, 'mem_me'),
    ).rejects.toThrow(/Owner is not an active member/);
    expect(tx.policy.create).not.toHaveBeenCalled();
  });

  it('refuses to submit a policy without an owner for approval', async () => {
    db.policy.findUnique.mockResolvedValue({ id: 'pol_1', assigneeId: null });
    await expect(
      service.submitForApproval('pol_1', 'pv_1', 'org_1', { approverId: 'mem_appr' }, 'mem_me'),
    ).rejects.toThrow('Set a policy owner before submitting it for approval');
    expect(db.policy.findUnique.mock.calls[0][0].where).toEqual({ id: 'pol_1', organizationId: 'org_1' });
  });
});
