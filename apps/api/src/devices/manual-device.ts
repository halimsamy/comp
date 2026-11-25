import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { CreateDeviceDto } from './dto/create-device.dto';

/**
 * Records a device that has no agent or integration (e.g. a Linux workstation).
 * Its four checks are attested by the admin; it's compliant only when all pass.
 */
export async function createManualDevice({
  organizationId,
  dto,
}: {
  organizationId: string;
  dto: CreateDeviceDto;
}) {
  const member = await findActiveMember({ organizationId, memberId: dto.memberId });
  return db.device.create({
    data: {
      organizationId,
      ...manualDeviceData({ memberId: member.id, dto }),
      source: 'manual',
    },
    select: { id: true, name: true, isCompliant: true },
  });
}

/** Replaces a manual device's details and attested checks; agent and synced devices report their own. */
export async function updateManualDevice({
  organizationId,
  id,
  dto,
}: {
  organizationId: string;
  id: string;
  dto: CreateDeviceDto;
}) {
  const device = await db.device.findFirst({
    where: { id, organizationId, source: 'manual' },
    select: { id: true },
  });
  if (!device) throw new NotFoundException('Manual device not found');
  const member = await findActiveMember({ organizationId, memberId: dto.memberId });
  return db.device.update({
    where: { id: device.id },
    data: manualDeviceData({ memberId: member.id, dto }),
    select: { id: true, name: true, isCompliant: true },
  });
}

async function findActiveMember({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}) {
  const member = await db.member.findFirst({
    where: { id: memberId, organizationId, deactivated: false },
    select: { id: true },
  });
  if (!member) throw new NotFoundException('Member not found');
  return member;
}

function manualDeviceData({ memberId, dto }: { memberId: string; dto: CreateDeviceDto }) {
  const checks = {
    diskEncryptionEnabled: dto.diskEncryptionEnabled,
    antivirusEnabled: dto.antivirusEnabled,
    passwordPolicySet: dto.passwordPolicySet,
    screenLockEnabled: dto.screenLockEnabled,
  };
  const name = dto.name.trim();
  return {
    memberId,
    name,
    hostname: dto.hostname?.trim() || name,
    platform: dto.platform,
    osVersion: dto.osVersion.trim(),
    serialNumber: dto.serialNumber?.trim() || null,
    hardwareModel: dto.hardwareModel?.trim() || null,
    ...checks,
    isCompliant: Object.values(checks).every(Boolean),
    lastCheckIn: new Date(),
  };
}
