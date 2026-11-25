import { NotFoundException } from '@nestjs/common';

jest.mock('@db', () => ({
  db: {
    member: { findFirst: jest.fn() },
    device: { create: jest.fn() },
  },
}));

import { db } from '@db';
import { createManualDevice } from './manual-device';

const mocked = (fn: unknown) => fn as jest.Mock;
const dto = {
  memberId: 'mem_1',
  name: ' Linux box ',
  platform: 'linux' as const,
  osVersion: 'Ubuntu 24.04',
  diskEncryptionEnabled: true,
  antivirusEnabled: true,
  passwordPolicySet: true,
  screenLockEnabled: true,
};

describe('createManualDevice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('404s for a member outside the organization', async () => {
    mocked(db.member.findFirst).mockResolvedValue(null);
    await expect(createManualDevice({ organizationId: 'org_1', dto })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mem_1', organizationId: 'org_1', deactivated: false } }),
    );
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it('records a manual device, compliant only when every check passes', async () => {
    mocked(db.member.findFirst).mockResolvedValue({ id: 'mem_1' });
    await createManualDevice({ organizationId: 'org_1', dto });
    await createManualDevice({ organizationId: 'org_1', dto: { ...dto, screenLockEnabled: false } });
    const [first, second] = mocked(db.device.create).mock.calls.map((c) => c[0].data);
    expect(first).toEqual(
      expect.objectContaining({
        organizationId: 'org_1',
        memberId: 'mem_1',
        name: 'Linux box',
        hostname: 'Linux box',
        source: 'manual',
        serialNumber: null,
        isCompliant: true,
        lastCheckIn: expect.any(Date),
      }),
    );
    expect(second.isCompliant).toBe(false);
  });
});
