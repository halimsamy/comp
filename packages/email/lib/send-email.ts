import { randomUUID } from 'node:crypto';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { type EmailAttachment, sendWithSendGrid } from './sendgrid';

export type { EmailAttachment } from './sendgrid';

function maskEmail(value: string): string {
  const [name = '', domain = ''] = value.toLowerCase().split('@');
  if (!domain) return 'invalid-email';
  const safeName =
    name.length <= 2 ? (name[0] ?? '') : `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;
  return `${safeName}@${domain}`;
}

function maskEmailList(value: string): string {
  return value
    .split(',')
    .map((email) => maskEmail(email.trim()))
    .join(', ');
}

export const sendEmail = async ({
  to,
  subject,
  react,
  marketing,
  system,
  test,
  cc,
  scheduledAt,
  attachments,
}: {
  to: string;
  subject: string;
  react: ReactElement;
  marketing?: boolean;
  system?: boolean;
  test?: boolean;
  cc?: string | string[];
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}) => {
  const fromAddress = marketing
    ? process.env.EMAIL_FROM_MARKETING
    : system
      ? process.env.EMAIL_FROM_SYSTEM
      : process.env.EMAIL_FROM_DEFAULT;
  const toAddress = test ? process.env.EMAIL_TO_TEST : to;
  const replyTo = marketing ? process.env.EMAIL_REPLY_TO_MARKETING : undefined;

  if (!fromAddress) {
    throw new Error('Missing FROM address in environment variables');
  }
  if (!toAddress) {
    throw new Error('Missing TO address in environment variables');
  }

  const requestId = randomUUID();
  const startTime = Date.now();

  try {
    console.info('[email] send start', {
      requestId,
      provider: 'sendgrid',
      from: fromAddress,
      to: maskEmailList(toAddress),
      subject,
      scheduledAt,
      flags: {
        marketing: Boolean(marketing),
        system: Boolean(system),
        test: Boolean(test),
      },
    });

    const { id } = await sendWithSendGrid({
      from: fromAddress,
      to: toAddress,
      cc,
      replyTo,
      subject,
      html: await render(react),
      sendAt: scheduledAt,
      attachments,
    });

    console.info('[email] send success', {
      requestId,
      provider: 'sendgrid',
      to: maskEmailList(toAddress),
      messageId: id,
      durationMs: Date.now() - startTime,
    });

    return { message: 'Email sent successfully', id };
  } catch (error) {
    console.error('[email] send failure', {
      requestId,
      provider: 'sendgrid',
      to: maskEmailList(toAddress),
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error('Failed to send email');
  }
};
