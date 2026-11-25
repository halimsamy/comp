import { NotFoundException } from '@nestjs/common';

jest.mock('@db', () => ({
  db: {
    member: { findFirst: jest.fn() },
    device: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  },
}));

import { db } from '@db';
import { createManualDevice, updateManualDevice } from './manual-device';

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
    await expect(createManualDevice({ organizationId: 'org_1', dto, attestedById: 'usr_admin' })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mem_1', organizationId: 'org_1', deactivated: false } }),
    );
    expect(db.device.create).not.toHaveBeenCalled();
  });

  it('records a manual device, compliant only when every check passes', async () => {
    mocked(db.member.findFirst).mockResolvedValue({ id: 'mem_1' });
    await createManualDevice({ organizationId: 'org_1', dto, attestedById: 'usr_admin' });
    await createManualDevice({ organizationId: 'org_1', dto: { ...dto, screenLockEnabled: false }, attestedById: null });
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
        attestedById: 'usr_admin',
        attestedAt: first.lastCheckIn,
      }),
    );
    expect(second.isCompliant).toBe(false);
    expect(second.attestedById).toBeNull();
  });
});

describe('updateManualDevice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only edits manual devices of the organization', async () => {
    mocked(db.device.findFirst).mockResolvedValue(null);
    await expect(
      updateManualDevice({ organizationId: 'org_1', id: 'dev_agent', dto, attestedById: 'usr_admin' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.device.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dev_agent', organizationId: 'org_1', source: 'manual' } }),
    );
    expect(db.device.update).not.toHaveBeenCalled();
  });

  it('replaces the details, recomputes compliance and re-attests as the editor', async () => {
    mocked(db.device.findFirst).mockResolvedValue({ id: 'dev_1' });
    mocked(db.member.findFirst).mockResolvedValue({ id: 'mem_1' });
    await updateManualDevice({
      organizationId: 'org_1',
      id: 'dev_1',
      dto: { ...dto, antivirusEnabled: false },
      attestedById: 'usr_editor',
    });
    expect(db.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dev_1' },
        data: expect.objectContaining({
          name: 'Linux box',
          antivirusEnabled: false,
          isCompliant: false,
          attestedById: 'usr_editor',
          attestedAt: expect.any(Date),
        }),
      }),
    );
  });
});
