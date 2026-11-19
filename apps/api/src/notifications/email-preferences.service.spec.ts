const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@db', () => ({
  db: {
    user: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
  Prisma: {},
}));

import { NotFoundException } from '@nestjs/common';
import { EmailPreferencesService } from './email-preferences.service';

describe('EmailPreferencesService.merge', () => {
  const service = new EmailPreferencesService();
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset().mockResolvedValue({});
  });

  it('keeps keys that were not sent', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'usr_1',
      emailPreferences: {
        policyNotifications: false,
        taskReminders: true,
        digestFrequency: 'daily',
      },
    });
    const result = await service.merge({
      where: { id: 'usr_1' },
      patch: {
        ownershipAssignments: false,
        complianceDigestFrequency: 'weekly',
      },
    });
    const expected = {
      policyNotifications: false,
      taskReminders: true,
      digestFrequency: 'daily',
      ownershipAssignments: false,
      complianceDigestFrequency: 'weekly',
    };
    expect(result.preferences).toEqual(expected);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'usr_1' },
      data: {
        emailPreferences: expected,
        emailNotificationsUnsubscribed: false,
      },
    });
  });

  it('marks the user unsubscribed only when every toggle is off', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'usr_1',
      emailPreferences: { taskReminders: true },
    });
    await service.merge({
      where: { email: 'a@b.co' },
      patch: { taskReminders: false },
    });
    expect(
      mockUpdate.mock.calls[0][0].data.emailNotificationsUnsubscribed,
    ).toBe(true);
  });

  it('starts from an empty object when nothing is stored', async () => {
    mockFindUnique.mockResolvedValue({ id: 'usr_1', emailPreferences: null });
    const result = await service.merge({
      where: { id: 'usr_1' },
      patch: { slaAlerts: true },
    });
    expect(result.preferences).toEqual({ slaAlerts: true });
  });

  it('404s for an unknown user', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      service.merge({ where: { id: 'x' }, patch: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
