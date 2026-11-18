import { db } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import {
  addMonths,
  TRAINING_VALIDITY_MONTHS,
} from '../../training/training-cycles';

/**
 * Built-in training is valid for 12 months (PCI DSS 12.6.3). Expired
 * completions are archived to TrainingCompletionRecord and cleared, so the
 * portal reassigns the video and every people score sees it as outstanding.
 */
export async function expireTrainingCompletions(now = new Date()) {
  const cutoff = addMonths({ date: now, months: -TRAINING_VALIDITY_MONTHS });
  const expired = await db.employeeTrainingVideoCompletion.findMany({
    where: { completedAt: { lte: cutoff } },
    select: {
      id: true,
      memberId: true,
      videoId: true,
      completedAt: true,
      member: { select: { organizationId: true } },
    },
  });

  let archived = 0;
  for (const row of expired) {
    if (!row.completedAt) continue;
    // Completions written before history existed (or by another path) are archived here.
    const existing = await db.trainingCompletionRecord.findFirst({
      where: {
        memberId: row.memberId,
        moduleId: row.videoId,
        completedAt: row.completedAt,
      },
      select: { id: true },
    });
    if (!existing) {
      await db.trainingCompletionRecord.create({
        data: {
          organizationId: row.member.organizationId,
          memberId: row.memberId,
          moduleId: row.videoId,
          completedAt: row.completedAt,
          expiresAt: addMonths({
            date: row.completedAt,
            months: TRAINING_VALIDITY_MONTHS,
          }),
        },
      });
      archived++;
    }
    await db.employeeTrainingVideoCompletion.update({
      where: { id: row.id },
      data: { completedAt: null },
    });
  }

  logger.info('Expired training completions', { expired: expired.length, archived });
  return { expired: expired.length, archived };
}

export const expireTrainingCompletionsSchedule = schedules.task({
  id: 'expire-training-completions-schedule',
  cron: '0 3 * * *', // daily 03:00 UTC
  maxDuration: 30 * 60, // seconds
  run: () => expireTrainingCompletions(),
});
