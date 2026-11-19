import { isOrgParticipant } from '@/lib/org-participation-rule';
import { db } from '@db/server';
import { isUserUnsubscribed } from '@trycompai/email';
import { logger, schedules } from '@trycompai/jobs';
import { sendWeeklyTaskDigestEmailTask } from '../email/weekly-task-digest-email';
import {
  getDigestFrequency,
  isDigestDue,
  isFoldedIntoComplianceDigest,
  selectDigestTasks,
} from './task-digest-helpers';

const ORG_INACTIVITY_DAYS = 90;

export const weeklyTaskReminder = schedules.task({
  id: 'weekly-task-reminder',
  cron: '0 9 * * *', // Daily at 9:00 AM UTC; weekly digests only go out on Mondays
  maxDuration: 60 * 10, // 10 minutes
  run: async () => {
    logger.info('Starting weekly task reminder job');

    const inactivityCutoff = new Date();
    inactivityCutoff.setDate(inactivityCutoff.getDate() - ORG_INACTIVITY_DAYS);

    // Only email orgs that are active: have access, completed onboarding,
    // and at least one member logged in within the last 90 days
    const organizations = await db.organization.findMany({
      where: {
        hasAccess: true,
        onboardingCompleted: true,
        members: {
          some: {
            deactivated: false,
            user: {
              sessions: {
                some: {
                  updatedAt: { gte: inactivityCutoff },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        isInternal: true,
        members: {
          where: {
            deactivated: false,
          },
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                emailPreferences: true,
              },
            },
          },
        },
      },
    });

    logger.info(
      `Found ${organizations.length} active organizations to process (skipped orgs with no sessions in ${ORG_INACTIVITY_DAYS} days)`,
    );

    // Build email payloads for all members with TODO tasks
    const emailPayloads = [];

    for (const org of organizations) {
      logger.info(`Processing organization: ${org.name} (${org.id})`);

      // Get all open tasks for this organization
      const todoTasks = await db.task.findMany({
        where: {
          organizationId: org.id,
          status: { in: ['todo', 'in_progress'] },
        },
        select: {
          id: true,
          title: true,
          assigneeId: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Skip if no TODO tasks
      if (todoTasks.length === 0) {
        logger.info(`No TODO tasks found for organization ${org.name}`);
        continue;
      }

      logger.info(`Found ${todoTasks.length} TODO tasks for organization ${org.name}`);

      // Build payload for each member — the downstream
      // isUserUnsubscribed check handles role-based filtering via the notification matrix.
      for (const member of org.members) {
        if (!member.user.email || !member.user.name) {
          logger.warn(`Skipping member ${member.id} - missing email or name`);
          continue;
        }

        // Exclude platform admins (Comp AI staff) unless the org is internal —
        // the single participation rule (no per-member owner carve-out).
        if (
          !isOrgParticipant(member.user.role, {
            orgIsInternal: org.isInternal,
          })
        ) {
          continue;
        }

        if (!isDigestDue({ frequency: getDigestFrequency(member.user.emailPreferences) })) {
          continue;
        }

        // One combined Monday email (#10): the compliance digest carries this member's tasks.
        if (
          isFoldedIntoComplianceDigest({ role: member.role }) &&
          !(await isUserUnsubscribed(db, member.user.email, 'complianceDigest', org.id))
        ) {
          continue;
        }

        const memberTasks = selectDigestTasks({
          tasks: todoTasks,
          memberId: member.id,
          role: member.role,
        });
        if (memberTasks.length === 0) continue;

        emailPayloads.push({
          payload: {
            email: member.user.email,
            userName: member.user.name,
            organizationName: org.name,
            organizationId: org.id,
            tasks: memberTasks,
          },
        });
      }
    }

    // Batch trigger all emails with concurrency control
    // Keep each batchTrigger call to 500 items
    if (emailPayloads.length > 0) {
      const BATCH_SIZE = 500;
      const batches = [];

      for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
        batches.push(emailPayloads.slice(i, i + BATCH_SIZE));
      }

      logger.info(`Triggering ${emailPayloads.length} emails in ${batches.length} batch(es)`);

      try {
        for (const batch of batches) {
          await sendWeeklyTaskDigestEmailTask.batchTrigger(batch);
          logger.info(`Triggered batch of ${batch.length} emails`);
        }

        logger.info(`Successfully triggered all ${emailPayloads.length} weekly task digest emails`);
      } catch (error) {
        logger.error(`Failed to trigger batch email sends: ${error}`);

        return {
          success: false,
          timestamp: new Date().toISOString(),
          organizationsProcessed: organizations.length,
          totalAdminsProcessed: emailPayloads.length,
          emailsTriggered: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      organizationsProcessed: organizations.length,
      emailsTriggered: emailPayloads.length,
    };

    logger.info('Weekly task reminder job completed', summary);

    return summary;
  },
});
