import { isOrgParticipant } from '@/lib/org-participation-rule';
import { db } from '@db/server';
import { Novu } from '@novu/api';
import { logger, schedules } from '@trycompai/jobs';
import { shouldNotifyReviewDue } from './policy-schedule-helpers';

export const policySchedule = schedules.task({
  id: 'policy-schedule',
  machine: 'large-1x',
  cron: '0 */12 * * *', // Every 12 hours
  maxDuration: 60 * 10, // 10 minutes
  run: async () => {
    const now = new Date();

    const novu = new Novu({
      secretKey: process.env.NOVU_API_KEY,
    });

    // Policies in force (published, or published with a newer version
    // pending approval) whose next-review date is set.
    const candidatePolicies = await db.policy.findMany({
      where: {
        isArchived: false,
        archivedAt: null,
        lastPublishedAt: { not: null },
        status: { in: ['published', 'needs_review'] },
        reviewDate: {
          not: null,
        },
        frequency: {
          not: null,
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            isInternal: true,
            members: {
              where: {
                deactivated: false,
              },
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // reviewDate is the date the next review is due (set on publish and on
    // every recorded review). "Review due" is derived from it, never stored,
    // so this job only notifies (first run after the due date, then weekly).
    const overduePolicies = candidatePolicies.filter((policy) =>
      shouldNotifyReviewDue({ reviewDate: policy.reviewDate, now }),
    );

    logger.info(`Found ${overduePolicies.length} policies to notify about a due review`);

    if (overduePolicies.length === 0) {
      return {
        success: true,
        notifiedPolicies: 0,
        message: 'No policy review notifications due',
      };
    }

    try {
      const policyIds = overduePolicies.map((policy) => policy.id);

      // Build array of all org members as recipients for each overdue policy.
      // The notification matrix (isUserUnsubscribed) handles role-based filtering.
      const recipientsMap = new Map<
        string,
        {
          email: string;
          userId: string;
          name: string;
          policy: (typeof overduePolicies)[number];
        }
      >();
      const addRecipients = (
        members: Array<{
          user: {
            id: string;
            email: string;
            name?: string;
            role?: string | null;
          };
        }>,
        policy: (typeof overduePolicies)[number],
      ) => {
        // Exclude platform admins (Comp AI staff) unless the org is internal —
        // the single participation rule (no per-member owner carve-out).
        const orgIsInternal = policy.organization?.isInternal ?? false;
        for (const entry of members) {
          const user = entry.user;
          if (!user?.email || !user.id) continue;
          if (!isOrgParticipant(user.role, { orgIsInternal })) {
            continue;
          }
          const key = `${user.id}-${policy.id}`;
          if (!recipientsMap.has(key)) {
            recipientsMap.set(key, {
              email: user.email,
              userId: user.id,
              name: user.name ?? '',
              policy,
            });
          }
        }
      };

      // Add all org members as potential recipients for each policy
      for (const policy of overduePolicies) {
        if (policy.organization && Array.isArray(policy.organization.members)) {
          addRecipients(policy.organization.members, policy);
        }
      }

      // Final deduplicated recipients array
      const recipients = Array.from(recipientsMap.values());

      logger.info(
        `Sending notifications to ${recipients.length} recipients: ${recipients.map((r) => r.email).join(', ')}`,
      );

      await novu.triggerBulk({
        events: recipients.map((recipient) => ({
          workflowId: 'policy-review-required',
          to: {
            subscriberId: `${recipient.userId}-${recipient.policy.organizationId}`,
            email: recipient.email,
          },
          payload: {
            email: recipient.email,
            userName: recipient.name,
            policyName: recipient.policy.name,
            organizationName: recipient.policy.organization.name,
            organizationId: recipient.policy.organizationId,
            policyId: recipient.policy.id,
            policyUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.trycomp.ai'}/${recipient.policy.organizationId}/policies/${recipient.policy.id}`,
          },
        })),
      });

      overduePolicies.forEach((policy) => {
        logger.info(
          `Review due for policy "${policy.name}" (${policy.id}) from org "${policy.organization.name}" - frequency ${policy.frequency} - due ${policy.reviewDate?.toISOString()}`,
        );
      });

      return {
        success: true,
        notifiedPolicies: policyIds.length,
        notifiedPolicyIds: policyIds,
        recipients: recipients.length,
        message: `Sent review-due notifications for ${policyIds.length} policies`,
      };
    } catch (error) {
      logger.error(`Failed to send policy review notifications: ${error}`);

      return {
        success: false,
        notifiedPolicies: 0,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to send policy review notifications',
      };
    }
  },
});
