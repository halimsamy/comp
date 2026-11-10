import { logger, queue, schemaTask } from '@trycompai/jobs';
import { z } from 'zod';
import { generateUnsubscribeToken, sendWithSendGrid } from '@trycompai/email';

// SendGrid has no multi-message batch endpoint; send this many at a time.
const PARALLEL_SENDS = 10;

const batchEmailQueue = queue({
  name: 'send-batch-email',
  concurrencyLimit: 5,
});

const batchEmailItemSchema = z.object({
  to: z.string(),
  subject: z.string(),
  html: z.string(),
  from: z.string().optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
});

export const sendBatchEmailTask = schemaTask({
  id: 'send-batch-email',
  queue: batchEmailQueue,
  retry: {
    maxAttempts: 3,
  },
  schema: z.object({
    emails: z.array(batchEmailItemSchema).min(1),
  }),
  run: async (params) => {
    const fromDefault =
      process.env.EMAIL_FROM_SYSTEM ?? process.env.EMAIL_FROM_DEFAULT;

    if (!fromDefault) {
      throw new Error('Missing FROM address in environment variables');
    }

    const toTest = process.env.EMAIL_TO_TEST;
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || 'https://api.trycomp.ai';

    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < params.emails.length; i += PARALLEL_SENDS) {
      const chunk = params.emails.slice(i, i + PARALLEL_SENDS);

      const results = await Promise.allSettled(
        chunk.map((email) => {
          const token = generateUnsubscribeToken(email.to);
          const oneClickUrl = `${apiBaseUrl}/v1/email/unsubscribe?email=${encodeURIComponent(email.to)}&token=${encodeURIComponent(token)}`;

          return sendWithSendGrid({
            from: email.from ?? fromDefault,
            to: toTest ?? email.to,
            cc: email.cc,
            subject: email.subject,
            html: email.html,
            headers: {
              'List-Unsubscribe': `<${oneClickUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
        }),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          totalSent += 1;
          return;
        }
        totalFailed += 1;
        logger.warn('Batch email failed for recipient', {
          index: i + index,
          to: chunk[index]?.to,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      });
    }

    logger.info('Batch email task complete', { totalSent, totalFailed });
    return { totalSent, totalFailed };
  },
});
