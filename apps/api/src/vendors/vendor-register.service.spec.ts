import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorRegisterService } from './vendor-register.service';

jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    vendor: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    member: { findMany: jest.fn() },
    taskItem: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../utils/org-participation', () => ({
  isMemberOrgParticipant: jest.fn().mockResolvedValue(true),
}));
jest.mock('../notifications/ownership-notifier.service', () => ({
  OwnershipNotifier: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('@db') as {
  db: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
};

const orgId = 'org_1';

describe('VendorRegisterService', () => {
  const owners = { notify: jest.fn() };
  const service = new VendorRegisterService(
    owners as unknown as ConstructorParameters<typeof VendorRegisterService>[0],
  );

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
    db.vendor.update.mockImplementation((args: unknown) => args);
    db.taskItem.updateMany.mockImplementation((args: unknown) => args);
  });

  it('rejects vendors outside the organization', async () => {
    db.vendor.findMany.mockResolvedValue([]);
    await expect(
      service.bulkUpdate({
        organizationId: orgId,
        updates: [{ id: 'vnd_other', criticality: 'high' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.vendor.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['vnd_other'] },
      organizationId: orgId,
    });
  });

  it('rejects owners who are not active members of the organization', async () => {
    db.vendor.findMany.mockResolvedValue([
      { id: 'vnd_1', name: 'Stripe', assigneeId: null },
    ]);
    db.member.findMany.mockResolvedValue([]);
    await expect(
      service.bulkUpdate({
        organizationId: orgId,
        updates: [{ id: 'vnd_1', assigneeId: 'mem_x' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies every change in one transaction and emails new owners', async () => {
    db.vendor.findMany.mockResolvedValue([
      { id: 'vnd_1', name: 'Stripe', assigneeId: null },
      { id: 'vnd_2', name: 'AWS', assigneeId: 'mem_2' },
    ]);
    db.member.findMany.mockResolvedValue([
      { id: 'mem_2', user: { role: 'user' } },
    ]);
    const result = await service.bulkUpdate({
      organizationId: orgId,
      actorUserId: 'usr_1',
      updates: [
        {
          id: 'vnd_1',
          criticality: 'critical',
          handlesCardholderData: true,
          contractEndDate: '2027-01-31',
          assigneeId: 'mem_2',
        },
        { id: 'vnd_2', assigneeId: 'mem_2', affectsCdeSecurity: true },
      ],
    });
    expect(result).toEqual({ updated: 2 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const first = db.vendor.update.mock.calls[0][0];
    expect(first.data).toMatchObject({
      criticality: 'critical',
      handlesCardholderData: true,
      contractEndDate: new Date('2027-01-31'),
      assigneeId: 'mem_2',
    });
    // Only the vendor whose owner changed triggers an email.
    expect(owners.notify).toHaveBeenCalledTimes(1);
    expect(owners.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        memberId: 'mem_2',
        entityType: 'vendor',
        url: '/vendors/vnd_1',
        assignedByUserId: 'usr_1',
      }),
    );
  });

  it('archives a vendor and cancels its open reminders', async () => {
    db.vendor.findFirst.mockResolvedValue({ id: 'vnd_1' });
    await service.archive({
      vendorId: 'vnd_1',
      organizationId: orgId,
      reason: ' Contract ended ',
    });
    expect(db.vendor.findFirst.mock.calls[0][0].where).toEqual({
      id: 'vnd_1',
      organizationId: orgId,
    });
    const update = db.vendor.update.mock.calls[0][0];
    expect(update.data.archivedAt).toBeInstanceOf(Date);
    expect(update.data.archiveReason).toBe('Contract ended');
    expect(db.taskItem.updateMany.mock.calls[0][0]).toMatchObject({
      where: { organizationId: orgId, entityId: 'vnd_1', entityType: 'vendor' },
      data: { status: 'canceled' },
    });
  });

  it('404s when archiving or restoring a vendor of another organization', async () => {
    db.vendor.findFirst.mockResolvedValue(null);
    await expect(
      service.archive({ vendorId: 'vnd_x', organizationId: orgId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.unarchive({ vendorId: 'vnd_x', organizationId: orgId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.vendor.update).not.toHaveBeenCalled();
  });
});
