const mockMemberUpdate = jest.fn();
const mockSessionDeleteMany = jest.fn();

jest.mock('@db', () => ({
  db: {
    member: { update: (...args: unknown[]) => mockMemberUpdate(...args) },
    session: { deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args) },
  },
}));
jest.mock('@trycompai/email', () => ({ isUserUnsubscribed: jest.fn() }));
jest.mock('../../email/trigger-email', () => ({ triggerEmail: jest.fn() }));
jest.mock('../../email/templates/unassigned-items-notification', () => ({
  UnassignedItemsNotificationEmail: jest.fn(),
}));

import { deactivateMember } from './member-deactivation';

describe('deactivateMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deactivates, opens offboarding and kills sessions', async () => {
    await deactivateMember({ memberId: 'mem_1', organizationId: 'org_1', userId: 'usr_1' });

    const call = mockMemberUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'mem_1', organizationId: 'org_1' });
    expect(call.data.deactivated).toBe(true);
    expect(call.data.isActive).toBe(false);
    expect(call.data.offboardDate).toBeInstanceOf(Date);
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'usr_1' } });
  });

  it('keeps an existing offboard date', async () => {
    const offboardDate = new Date('2026-01-02');
    await deactivateMember({ memberId: 'mem_1', organizationId: 'org_1', userId: 'usr_1', offboardDate });
    expect(mockMemberUpdate.mock.calls[0][0].data.offboardDate).toBe(offboardDate);
  });

  it('clears the offboard date when offboarding is skipped', async () => {
    await deactivateMember({
      memberId: 'mem_1',
      organizationId: 'org_1',
      userId: 'usr_1',
      offboardDate: new Date(),
      skipOffboarding: true,
    });
    expect(mockMemberUpdate.mock.calls[0][0].data.offboardDate).toBeNull();
  });
});
