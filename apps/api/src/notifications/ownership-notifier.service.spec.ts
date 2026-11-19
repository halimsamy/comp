const mockMember = jest.fn();
const mockOrg = jest.fn();
jest.mock('@db', () => ({
  db: {
    member: { findFirst: (...a: unknown[]) => mockMember(...a) },
    organization: { findUnique: (...a: unknown[]) => mockOrg(...a) },
  },
}));
const mockUnsubscribed = jest.fn();
jest.mock('@trycompai/email', () => ({
  isUserUnsubscribed: (...a: unknown[]) => mockUnsubscribed(...a),
}));
const mockTrigger = jest.fn();
jest.mock('../email/trigger-email', () => ({
  triggerEmail: (...a: unknown[]) => mockTrigger(...a),
}));
jest.mock('../email/templates/questionnaire-review', () => ({
  QuestionnaireReviewEmail: (props: unknown) => props,
}));

import { OwnershipNotifier } from './ownership-notifier.service';

const notice = {
  organizationId: 'org_1',
  memberId: 'mem_1',
  entityType: 'risk',
  entityName: 'Laptop theft',
  url: '/risk/rsk_1',
};

describe('OwnershipNotifier', () => {
  const notifier = new OwnershipNotifier();
  beforeEach(() => {
    jest.clearAllMocks();
    mockMember.mockResolvedValue({
      user: { id: 'usr_1', email: 'ann@spare.co', name: 'Ann', role: 'user' },
    });
    mockOrg.mockResolvedValue({ name: 'Spare', isInternal: false });
    mockUnsubscribed.mockResolvedValue(false);
    mockTrigger.mockResolvedValue({ id: 'em_1' });
  });

  it('emails the new owner with an org-scoped link', async () => {
    await expect(notifier.notify(notice)).resolves.toBe(true);
    expect(mockMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mem_1', organizationId: 'org_1', deactivated: false },
      }),
    );
    expect(mockUnsubscribed).toHaveBeenCalledWith(
      expect.anything(),
      'ann@spare.co',
      'ownershipAssignments',
      'org_1',
    );
    const call = mockTrigger.mock.calls[0][0];
    expect(call.to).toBe('ann@spare.co');
    expect(call.subject).toBe('You now own the risk "Laptop theft"');
    expect(call.react.ctaUrl).toMatch(/\/org_1\/risk\/rsk_1$/);
  });

  it('respects the ownershipAssignments opt-out', async () => {
    mockUnsubscribed.mockResolvedValue(true);
    await expect(notifier.notify(notice)).resolves.toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('does not email people about their own change', async () => {
    await expect(
      notifier.notify({ ...notice, assignedByUserId: 'usr_1' }),
    ).resolves.toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('skips members outside the organization and never throws', async () => {
    mockMember.mockResolvedValue(null);
    await expect(notifier.notify(notice)).resolves.toBe(false);
    mockMember.mockRejectedValue(new Error('db down'));
    await expect(notifier.notify(notice)).resolves.toBe(false);
  });
});
