import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { VerifyBackgroundExternallyDto } from './dto/verify-background-externally.dto';

/**
 * #179: background screening done outside Comp AI (agency, previous employer
 * check) recorded in bulk, so the people checklist shows it as complete.
 * Members with a check already completed are left as they are.
 */
export async function verifyBackgroundExternally({
  organizationId,
  userId,
  dto,
  attachments,
}: {
  organizationId: string;
  userId?: string;
  dto: VerifyBackgroundExternallyDto;
  attachments: AttachmentsService;
}) {
  const verifiedAt = new Date(dto.verifiedAt);
  if (verifiedAt.getTime() > Date.now()) {
    throw new BadRequestException('The verification date cannot be in the future');
  }
  const members = await db.member.findMany({
    where: { id: { in: dto.memberIds }, organizationId, deactivated: false },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      backgroundCheckRequests: { select: { status: true }, take: 1 },
    },
  });
  const pending = members.filter(
    (m) => !['completed', 'completed_with_flags'].includes(m.backgroundCheckRequests[0]?.status ?? ''),
  );
  const notes = `Verified externally by ${dto.provider.trim()}`;
  for (const member of pending) {
    const record = await db.backgroundCheckRequest.upsert({
      where: { organizationId_memberId: { organizationId, memberId: member.id } },
      // completedAt is kept by the DB trigger when it is given.
      create: {
        organizationId,
        memberId: member.id,
        employeeName: member.user.name || member.user.email,
        employeeEmail: member.user.email,
        requesterNotes: notes,
        status: 'completed',
        completedAt: verifiedAt,
        lastSyncedAt: new Date(),
      },
      update: { requesterNotes: notes, status: 'completed', completedAt: verifiedAt, lastSyncedAt: new Date() },
    });
    if (dto.fileName && dto.fileType && dto.fileData) {
      await attachments.uploadAttachment(
        organizationId,
        record.id,
        'background_check',
        { fileName: dto.fileName, fileType: dto.fileType, fileData: dto.fileData },
        userId,
      );
    }
  }
  return { verified: pending.length, skipped: dto.memberIds.length - pending.length };
}
