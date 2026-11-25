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
  const member = await db.member.findFirst({
    where: { id: dto.memberId, organizationId, deactivated: false },
    select: { id: true },
  });
  if (!member) throw new NotFoundException('Member not found');
  const checks = {
    diskEncryptionEnabled: dto.diskEncryptionEnabled,
    antivirusEnabled: dto.antivirusEnabled,
    passwordPolicySet: dto.passwordPolicySet,
    screenLockEnabled: dto.screenLockEnabled,
  };
  const name = dto.name.trim();
  return db.device.create({
    data: {
      organizationId,
      memberId: member.id,
      name,
      hostname: dto.hostname?.trim() || name,
      platform: dto.platform,
      osVersion: dto.osVersion.trim(),
      serialNumber: dto.serialNumber?.trim() || null,
      hardwareModel: dto.hardwareModel?.trim() || null,
      ...checks,
      isCompliant: Object.values(checks).every(Boolean),
      source: 'manual',
      lastCheckIn: new Date(),
    },
    select: { id: true, name: true, isCompliant: true },
  });
}
