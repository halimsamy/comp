jest.mock('@db', () => ({
  db: {
    member: { findFirst: jest.fn() },
    accessSystem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    accessSystemAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
    accessAccountOwner: { deleteMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { AccessSystemsService } from './access-systems.service';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';

describe('AccessSystemsService', () => {
  const service = new AccessSystemsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mocked(db.$transaction).mockResolvedValue([]);
  });

  it('rejects a duplicate system name', async () => {
    mocked(db.accessSystem.findFirst).mockResolvedValue({ id: 'asy_1' });
    await expect(
      service.create({ organizationId: ORG, name: ' Bank ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.accessSystem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, name: 'Bank' } }),
    );
  });

  it('replaces the account list on import, de-duplicating ids', async () => {
    mocked(db.accessSystem.findFirst).mockResolvedValue({ id: 'asy_1' });
    const result = await service.importAccounts({
      organizationId: ORG,
      id: 'asy_1',
      accounts: [
        {
          accountId: 'jdoe',
          email: 'JANE@acme.com',
          roles: [' Admin ', ''],
          lastLoginAt: '2026-01-02',
        },
        { accountId: 'jdoe', name: 'Jane Doe' },
        { accountId: 'svc', type: 'service' },
      ],
    });
    expect(result).toEqual({ imported: 2 });
    expect(db.accessSystemAccount.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          systemId: 'asy_1',
          externalId: 'jdoe',
          name: 'Jane Doe',
          email: null,
        }),
        expect.objectContaining({
          externalId: 'svc',
          type: 'service',
          status: 'active',
        }),
      ],
    });
  });

  it('404s when importing into another organization’s system', async () => {
    mocked(db.accessSystem.findFirst).mockResolvedValue(null);
    await expect(
      service.importAccounts({
        organizationId: ORG,
        id: 'asy_x',
        accounts: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.accessSystem.findFirst).toHaveBeenCalledWith({
      where: { id: 'asy_x', organizationId: ORG },
    });
  });

  describe('setOwner', () => {
    it('maps an account to a member of the organization', async () => {
      mocked(db.member.findFirst).mockResolvedValue({ id: 'mem_1' });
      await service.setOwner({
        organizationId: ORG,
        callerMemberId: 'mem_admin',
        systemKey: 'compai',
        accountId: 'a',
        memberId: 'mem_1',
      });
      expect(db.member.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem_1', organizationId: ORG },
        }),
      );
      expect(db.accessAccountOwner.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            organizationId: ORG,
            memberId: 'mem_1',
            updatedById: 'mem_admin',
          }),
        }),
      );
    });

    it('requires a justification for service accounts', async () => {
      await expect(
        service.setOwner({
          organizationId: ORG,
          systemKey: 'compai',
          accountId: 'a',
          isServiceAccount: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clears the mapping when neither owner nor service account is given', async () => {
      const result = await service.setOwner({
        organizationId: ORG,
        systemKey: 'compai',
        accountId: 'a',
        memberId: null,
      });
      expect(result).toEqual({ cleared: true });
      expect(db.accessAccountOwner.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: ORG, systemKey: 'compai', accountId: 'a' },
      });
    });

    it('rejects members of another organization', async () => {
      mocked(db.member.findFirst).mockResolvedValue(null);
      await expect(
        service.setOwner({
          organizationId: ORG,
          systemKey: 'compai',
          accountId: 'a',
          memberId: 'mem_x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
