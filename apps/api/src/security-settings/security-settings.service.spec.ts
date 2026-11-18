import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockOrgFindUnique = jest.fn();
const mockOrgUpdate = jest.fn();
const mockSessionFindUnique = jest.fn();
jest.mock('@db', () => ({
  db: {
    organization: {
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
      update: (...a: unknown[]) => mockOrgUpdate(...a),
    },
    session: { findUnique: (...a: unknown[]) => mockSessionFindUnique(...a) },
  },
}));

import { getAvailableSignInMethods, SecuritySettingsService } from './security-settings.service';

describe('SecuritySettingsService', () => {
  const service = new SecuritySettingsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrgFindUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 15, allowedSignInMethods: [] });
  });

  it('returns settings with options, scoped to the org', async () => {
    const res = await service.get('org_1');
    expect(mockOrgFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org_1' } }));
    expect(res.sessionIdleTimeoutMinutes).toBe(15);
    expect(res.idleTimeoutOptions).toContain(15);
    expect(res.availableSignInMethods.map((m) => m.id)).toEqual(
      expect.arrayContaining(['magic-link', 'email-otp']),
    );
  });

  it('404s for a missing org', async () => {
    mockOrgFindUnique.mockResolvedValue(null);
    await expect(service.get('org_x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the fields provided', async () => {
    await service.update({ organizationId: 'org_1', dto: { sessionIdleTimeoutMinutes: null } });
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { sessionIdleTimeoutMinutes: null },
    });
  });

  it('refuses an allow-list that would lock out the caller', async () => {
    mockSessionFindUnique.mockResolvedValue({ signInMethod: 'magic-link' });
    await expect(
      service.update({
        organizationId: 'org_1',
        sessionId: 'ses_1',
        dto: { allowedSignInMethods: ['google'] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('accepts an allow-list that keeps the caller method', async () => {
    mockSessionFindUnique.mockResolvedValue({ signInMethod: 'google' });
    await service.update({
      organizationId: 'org_1',
      sessionId: 'ses_1',
      dto: { allowedSignInMethods: ['google', 'microsoft'] },
    });
    expect(mockOrgUpdate).toHaveBeenCalled();
  });

  it('lists social providers only when configured', () => {
    expect(getAvailableSignInMethods({})).toEqual(['magic-link', 'email-otp']);
    expect(getAvailableSignInMethods({ AUTH_GOOGLE_ID: 'a', AUTH_GOOGLE_SECRET: 'b' })).toEqual([
      'google',
      'magic-link',
      'email-otp',
    ]);
  });
});
