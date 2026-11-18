import { auth } from '@/app/lib/auth';
import { assignedModulesWhere } from '@/lib/training-modules';
import { db } from '@db/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  moduleId: z.string().min(1),
  organizationId: z.string().min(1),
});

/**
 * Records that the authenticated employee completed one of their assigned
 * custom training modules. Like complete-training, portal self-service is
 * authorized by session + active membership, not the org RBAC role.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { moduleId, organizationId } = parsed.data;

  const member = await db.member.findFirst({
    where: { userId: session.user.id, organizationId, deactivated: false },
    select: { id: true, role: true, department: true },
  });
  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const trainingModule = await db.trainingModule.findFirst({
    where: {
      id: moduleId,
      ...assignedModulesWhere({
        organizationId,
        role: member.role,
        department: member.department,
      }),
    },
    select: { id: true, recurrenceMonths: true },
  });
  if (!trainingModule) {
    return NextResponse.json({ error: 'Training module not assigned' }, { status: 404 });
  }

  const completedAt = new Date();
  const expiresAt = new Date(completedAt);
  expiresAt.setMonth(expiresAt.getMonth() + trainingModule.recurrenceMonths);

  const record = await db.trainingCompletionRecord.create({
    data: { organizationId, memberId: member.id, moduleId, completedAt, expiresAt },
  });

  return NextResponse.json({ success: true, data: record });
}
