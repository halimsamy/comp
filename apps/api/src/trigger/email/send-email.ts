import { logger, queue, schemaTask } from '@trycompai/jobs';
import { z } from 'zod';
import { generateUnsubscribeToken, sendWithSendGrid } from '@trycompai/email';

const emailQueue = queue({
  name: 'send-email',
  concurrencyLimit: 10,
});

export const emailChannelSchema = z.enum([
  'marketing',
  'system',
  'trustPortal',
  'default',
]);
export type EmailChannel = z.infer<typeof emailChannelSchema>;

function resolveFromAddressForChannel(
  channel: EmailChannel | undefined,
): string | undefined {
  const fromMarketing = process.env.EMAIL_FROM_MARKETING;
  const fromSystem = process.env.EMAIL_FROM_SYSTEM;
  const fromDefault = process.env.EMAIL_FROM_DEFAULT;
  const fromTrustPortal = process.env.EMAIL_FROM_TRUST_PORTAL;

  switch (channel) {
    case 'trustPortal':
      return fromTrustPortal ?? fromSystem;
    case 'marketing':
      return fromMarketing;
    case 'system':
      return fromSystem;
    case 'default':
      return fromDefault;
    default:
      return undefined;
  }
}

export const sendEmailTask = schemaTask({
  id: 'send-email',
  queue: emailQueue,
  retry: {
    maxAttempts: 3,
  },
  schema: z.object({
    to: z.string(),
    subject: z.string(),
    html: z.string(),
    channel: emailChannelSchema.optional(),
    from: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    scheduledAt: z.string().optional(),
    attachments: z
      .array(
        z.object({
          filename: z.string(),
          content: z.string(),
          contentType: z.string().optional(),
        }),
      )
      .optional(),
  }),
  run: async (params) => {
    const toTest = process.env.EMAIL_TO_TEST;
    const fromSystem = process.env.EMAIL_FROM_SYSTEM;
    const fromDefault = process.env.EMAIL_FROM_DEFAULT;

    const fromAddress =
      params.from ??
      resolveFromAddressForChannel(params.channel) ??
      fromSystem ??
      fromDefault;
    const toAddress = toTest ?? params.to;

    if (!fromAddress) {
      throw new Error('Missing FROM address in environment variables');
    }

    try {
      // Build List-Unsubscribe headers for Gmail/RFC 8058 one-click compliance
      const apiBaseUrl =
        process.env.NEXT_PUBLIC_API_URL || 'https://api.trycomp.ai';
      const token = generateUnsubscribeToken(params.to);
      const oneClickUrl = `${apiBaseUrl}/v1/email/unsubscribe?email=${encodeURIComponent(params.to)}&token=${encodeURIComponent(token)}`;
      const headers: Record<string, string> = {
        'List-Unsubscribe': `<${oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };

      const { id } = await sendWithSendGrid({
        from: fromAddress,
        to: toAddress,
        cc: params.cc,
        subject: params.subject,
        html: params.html,
        headers,
        sendAt: params.scheduledAt,
        attachments: params.attachments,
      });

      logger.info('Email sent', { to: params.to, id });

      // Throttle: hold the concurrency slot for 1s to space out sends
      await new Promise((r) => setTimeout(r, 1000));

      return { id };
    } catch (error) {
      logger.error('Email sending failed', {
        to: params.to,
        subject: params.subject,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
