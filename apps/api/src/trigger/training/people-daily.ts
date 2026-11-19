import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { createAccessAccountsService } from '../../access-reviews/access-accounts.service';
import { notifyReviewers } from '../../access-reviews/access-review-notify';
import { reconcileRevocations } from '../../access-reviews/access-review-reconcile';
import { AccessRevocationService } from '../../offboarding-checklist/access-revocation.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { UploadsService } from '../../uploads/uploads.service';
import { sendSecurityTaskReminders } from '../../people-lifecycle/employee-reminders';
import { getReminderFrequency, reminderDue } from '../../people-lifecycle/reminder-settings';
import { deactivateDueLeavers } from '../../people/utils/scheduled-offboarding';

const DAY_MS = 86_400_000;
// Same threshold the other digests use: skip orgs nobody has signed into for 90 days.
const ORG_INACTIVITY_DAYS = 90;

/** Access reviews due in three days get one reminder to each assigned reviewer (#81). */
async function remindAccessReviewers(now: Date) {
  const start = new Date(now.getTime() + 3 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const reviews = await db.accessReview.findMany({
    where: { status: 'in_progress', dueDate: { gte: start, lt: new Date(start.getTime() + DAY_MS) } },
    select: { id: true, organizationId: true },
  });
  let sent = 0;
  for (const r of reviews) {
    sent += await notifyReviewers({ organizationId: r.organizationId, reviewId: r.id, kind: 'reminder' });
  }
  return sent;
}

/** Inventory syncs confirm pending revocations of reviews and of leavers (#82, #90). */
async function reconcileAccess() {
  const accounts = createAccessAccountsService();
  const revocations = new AccessRevocationService(new AttachmentsService(new UploadsService()), accounts);
  const orgs = await db.accessReview.findMany({
    where: { status: 'in_progress', items: { some: { decision: 'revoke' } } },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  for (const { organizationId } of orgs) {
    await reconcileRevocations({ organizationId, accounts });
  }
  const leavers = await db.member.findMany({
    where: { offboardDate: { gte: new Date(Date.now() - 90 * DAY_MS), lte: new Date() } },
    select: { id: true, organizationId: true },
  });
  for (const m of leavers) {
    await revocations.syncFromInventory({ organizationId: m.organizationId, memberId: m.id, offboarding: true });
  }
  return { reviewOrgs: orgs.length, leavers: leavers.length };
}

/** "Your security tasks" emails, per each organization's Off / Weekly / Daily setting (#162). */
async function sendEmployeeReminders(now: Date) {
  const cutoff = new Date(now.getTime() - ORG_INACTIVITY_DAYS * DAY_MS);
  const orgs = await db.organization.findMany({
    where: {
      hasAccess: true,
      onboardingCompleted: true,
      members: { some: { deactivated: false, user: { sessions: { some: { updatedAt: { gte: cutoff } } } } } },
    },
    select: { id: true, employeeReminderSetting: { select: { lastSentAt: true } } },
  });
  let sent = 0;
  for (const org of orgs) {
    const frequency = await getReminderFrequency(org.id);
    if (!reminderDue({ frequency, lastSentAt: org.employeeReminderSetting?.lastSentAt ?? null, now })) continue;
    const result = await sendSecurityTaskReminders({ organizationId: org.id, now });
    sent += result.sent;
    await db.employeeReminderSetting.upsert({
      where: { organizationId: org.id },
      create: { organizationId: org.id, frequency, lastSentAt: now },
      update: { lastSentAt: now },
    });
  }
  return sent;
}

/** One daily people job: leavers, access reconciliation, reviewer and employee reminders. */
export async function runPeopleDaily(now = new Date()) {
  const steps = {
    leavers: () => deactivateDueLeavers(now),
    access: () => reconcileAccess(),
    reviewerReminders: () => remindAccessReviewers(now),
    employeeReminders: () => sendEmployeeReminders(now),
  };
  const result: Record<string, unknown> = {};
  // Each step is independent: one failing must not skip the others.
  for (const [name, run] of Object.entries(steps)) {
    try {
      result[name] = await run();
    } catch (error) {
      logger.error(`people-daily step ${name} failed`, { error: String(error) });
      result[name] = 'failed';
    }
  }
  logger.info('People daily run', result);
  return result;
}

export const peopleDailySchedule = schedules.task({
  id: 'people-daily-schedule',
  cron: '0 14 * * *', // daily 14:00 UTC, when the former policy digest went out
  maxDuration: 30 * 60, // seconds
  run: () => runPeopleDaily(),
});
