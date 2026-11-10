const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

export interface EmailAttachment {
  filename: string;
  /** Buffer, or a base64-encoded string. */
  content: Buffer | string;
  contentType?: string;
}

export interface SendGridMessage {
  from: string;
  /** One address or a comma-separated list. */
  to: string;
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  /** ISO date; SendGrid accepts at most 72 hours ahead. */
  sendAt?: string;
  attachments?: EmailAttachment[];
}

interface SendGridAddress {
  email: string;
  name?: string;
}

/** Parses `Name <email@x>` or `email@x`. */
export function parseAddress(value: string): SendGridAddress {
  const match = value.trim().match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { email: value.trim() };
  const name = match[1]!.trim().replace(/^"|"$/g, '');
  return name ? { email: match[2]!.trim(), name } : { email: match[2]!.trim() };
}

function toAddressList(value: string | string[] | undefined): SendGridAddress[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : value.split(',');
  return list.filter((v) => v.trim()).map(parseAddress);
}

function toUnixSeconds(sendAt: string): number {
  const ms = Date.parse(sendAt);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid sendAt date: ${sendAt}`);
  }
  return Math.floor(ms / 1000);
}

export function buildSendGridBody(msg: SendGridMessage) {
  const to = toAddressList(msg.to);
  if (to.length === 0) {
    throw new Error('Email has no recipients');
  }
  // SendGrid rejects a request where the same address appears in to and cc.
  const toEmails = new Set(to.map((a) => a.email.toLowerCase()));
  const cc = toAddressList(msg.cc).filter((a) => !toEmails.has(a.email.toLowerCase()));

  return {
    personalizations: [{ to, ...(cc.length ? { cc } : {}) }],
    from: parseAddress(msg.from),
    ...(msg.replyTo ? { reply_to: parseAddress(msg.replyTo) } : {}),
    subject: msg.subject,
    content: [{ type: 'text/html', value: msg.html }],
    ...(msg.headers ? { headers: msg.headers } : {}),
    ...(msg.sendAt ? { send_at: toUnixSeconds(msg.sendAt) } : {}),
    ...(msg.attachments?.length
      ? {
          attachments: msg.attachments.map((att) => ({
            filename: att.filename,
            content:
              typeof att.content === 'string' ? att.content : att.content.toString('base64'),
            ...(att.contentType ? { type: att.contentType } : {}),
            disposition: 'attachment',
          })),
        }
      : {}),
  };
}

/** Sends one email through the SendGrid v3 Mail Send API. */
export async function sendWithSendGrid(msg: SendGridMessage): Promise<{ id: string | undefined }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SendGrid not configured - missing SENDGRID_API_KEY');
  }

  const response = await fetch(SENDGRID_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildSendGridBody(msg)),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`SendGrid error ${response.status}: ${detail}`);
  }

  return { id: response.headers.get('x-message-id') ?? undefined };
}
