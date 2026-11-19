import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { isUserUnsubscribed, PolicyNotificationEmail } from '@trycompai/email';
import { triggerEmail } from '../../email/trigger-email';
import { getAcknowledgementAudience } from './acknowledgement-audience';
import { exportAcknowledgementsCsv } from './acknowledgement-export';
import { isPolicyInForce } from './lifecycle-stage';

const startOfUtcDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const HISTORY_INCLUDE = {
  member: {
    select: { id: true, user: { select: { name: true, email: true } } },
  },
  policyVersion: { select: { id: true, version: true } },
  policy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PolicyAcknowledgementsService {
  private readonly logger = new Logger(PolicyAcknowledgementsService.name);

  async listForPolicy({
    policyId,
    organizationId,
  }: {
    policyId: string;
    organizationId: string;
  }) {
    const policy = await this.getPolicy({ policyId, organizationId });
    const [audience, history, reminders] = await Promise.all([
      getAcknowledgementAudience({ organizationId, policy }),
      db.policyAcknowledgement.findMany({
        where: { policyId, organizationId },
        orderBy: { acknowledgedAt: 'desc' },
        include: HISTORY_INCLUDE,
      }),
      db.policyAckReminder.groupBy({
        by: ['memberId'],
        where: { policyId },
        _max: { sentAt: true },
      }),
    ]);
    const lastReminded = new Map(
      reminders.map((row) => [row.memberId, row._max.sentAt ?? null]),
    );

    const members = audience.map((member) => {
      const own = history.filter((row) => row.memberId === member.id);
      const current = own.find(
        (row) => row.policyVersionId === policy.currentVersionId,
      );
      const last = own[0];
      return {
        memberId: member.id,
        name: member.user.name || member.user.email,
        email: member.user.email,
        department: member.department,
        status: policy.signedBy.includes(member.id)
          ? ('acknowledged' as const)
          : ('pending' as const),
        acknowledgedAt: current?.acknowledgedAt ?? null,
        lastAcknowledgedAt: last?.acknowledgedAt ?? null,
        lastAcknowledgedVersion: last?.policyVersion?.version ?? null,
        lastRemindedAt: lastReminded.get(member.id) ?? null,
      };
    });
    const acknowledged = members.filter((m) => m.status === 'acknowledged');

    return {
      policyId,
      policyName: policy.name,
      isRequiredToSign: policy.isRequiredToSign,
      status: policy.status,
      // False when no version was ever approved: nothing to acknowledge yet.
      inForce: isPolicyInForce(policy) && Boolean(policy.currentVersion),
      currentVersion: policy.currentVersion,
      summary: {
        total: members.length,
        acknowledged: acknowledged.length,
        pending: members.length - acknowledged.length,
      },
      members,
      history: history.map((row) => this.toHistoryItem(row)),
    };
  }

  async listForMember({
    memberId,
    organizationId,
  }: {
    memberId: string;
    organizationId: string;
  }) {
    if (!memberId) throw new BadRequestException('memberId is required');
    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const rows = await db.policyAcknowledgement.findMany({
      where: { memberId, organizationId },
      orderBy: { acknowledgedAt: 'desc' },
      include: HISTORY_INCLUDE,
    });
    return rows.map((row) => this.toHistoryItem(row));
  }

  exportCsv(params: {
    organizationId: string;
    policyId?: string;
    memberId?: string;
  }) {
    return exportAcknowledgementsCsv(params);
  }

  /**
   * Email every member who still has to acknowledge the current version,
   * at most once per member and day. Each email leaves a PolicyAckReminder row.
   */
  async remindPending({
    policyId,
    organizationId,
    now = new Date(),
  }: {
    policyId: string;
    organizationId: string;
    now?: Date;
  }) {
    const result = await this.listForPolicy({ policyId, organizationId });
    if (!result.inForce) {
      throw new BadRequestException(
        'Reminders can only be sent once a version has been approved and published',
      );
    }
    if (!result.isRequiredToSign) {
      throw new BadRequestException(
        'This policy does not require employee acknowledgement',
      );
    }

    const [organization, remindedToday] = await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      db.policyAckReminder.findMany({
        where: { policyId, sentAt: { gte: startOfUtcDay(now) } },
        select: { memberId: true },
      }),
    ]);
    const skipToday = new Set(remindedToday.map((row) => row.memberId));
    const counts = { sent: 0, alreadyRemindedToday: 0, unsubscribed: 0, failed: 0 };

    for (const member of result.members) {
      if (member.status !== 'pending' || !member.email) continue;
      if (skipToday.has(member.memberId)) {
        counts.alreadyRemindedToday++;
        continue;
      }
      const unsubscribed = await isUserUnsubscribed(
        db,
        member.email,
        'policyNotifications',
        organizationId,
      );
      if (unsubscribed) {
        counts.unsubscribed++;
        continue;
      }
      try {
        await triggerEmail({
          to: member.email,
          subject: 'Reminder: please review and accept this policy',
          react: PolicyNotificationEmail({
            email: member.email,
            userName: member.name || member.email,
            policyName: result.policyName,
            organizationName: organization?.name ?? '',
            organizationId,
            notificationType: member.lastAcknowledgedAt ? 'updated' : 'new',
          }),
          system: true,
          idempotencyKey: `policy-ack-reminder:${policyId}:${member.memberId}:${now.toISOString().slice(0, 10)}`,
        });
        await db.policyAckReminder.create({
          data: {
            policyId,
            memberId: member.memberId,
            policyVersionId: result.currentVersion?.id ?? null,
            sentAt: now,
          },
        });
        counts.sent++;
      } catch (error) {
        counts.failed++;
        this.logger.warn(
          `Failed to send acknowledgement reminder for policy ${policyId}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return { ...counts, pending: result.summary.pending };
  }

  private async getPolicy({
    policyId,
    organizationId,
  }: {
    policyId: string;
    organizationId: string;
  }) {
    const policy = await db.policy.findFirst({
      where: { id: policyId, organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        lastPublishedAt: true,
        signedBy: true,
        isRequiredToSign: true,
        visibility: true,
        visibleToDepartments: true,
        currentVersionId: true,
        currentVersion: { select: { id: true, version: true } },
      },
    });
    if (!policy) {
      throw new NotFoundException(`Policy with ID ${policyId} not found`);
    }
    return policy;
  }

  private toHistoryItem(row: {
    id: string;
    memberId: string | null;
    acknowledgedAt: Date;
    member: { id: string; user: { name: string | null; email: string } } | null;
    policyVersion: { id: string; version: number } | null;
    policy: { id: string; name: string };
  }) {
    return {
      id: row.id,
      policyId: row.policy.id,
      policyName: row.policy.name,
      policyVersionId: row.policyVersion?.id ?? null,
      version: row.policyVersion?.version ?? null,
      memberId: row.memberId,
      memberName: row.member
        ? row.member.user.name || row.member.user.email
        : 'Removed member',
      memberEmail: row.member?.user.email ?? '',
      acknowledgedAt: row.acknowledgedAt,
    };
  }
}
