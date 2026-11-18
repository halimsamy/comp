import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';

export async function findOpenReview({
  organizationId,
  id,
}: {
  organizationId: string;
  id: string;
}) {
  const review = await db.accessReview.findFirst({
    where: { id, organizationId },
    select: { id: true, status: true },
  });
  if (!review) throw new NotFoundException('Access review not found');
  if (review.status !== 'in_progress') {
    throw new BadRequestException('This access review is already signed off');
  }
  return review;
}

export async function findMemberName({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}) {
  const member = await db.member.findFirst({
    where: { id: memberId, organizationId },
    select: { user: { select: { name: true, email: true } } },
  });
  return member ? member.user.name || member.user.email : null;
}

export async function requireMemberName({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId?: string;
}) {
  const name = memberId
    ? await findMemberName({ organizationId, memberId })
    : null;
  if (!memberId || !name) {
    throw new ForbiddenException(
      'Access review decisions must be made by a signed-in member',
    );
  }
  return name;
}
