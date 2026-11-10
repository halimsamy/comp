import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSendGridBody, parseAddress, sendWithSendGrid } from './sendgrid';

describe('parseAddress', () => {
  it('parses a bare address', () => {
    expect(parseAddress(' a@x.test ')).toEqual({ email: 'a@x.test' });
  });

  it('parses a named address', () => {
    expect(parseAddress('"Comp AI" <noreply@x.test>')).toEqual({
      email: 'noreply@x.test',
      name: 'Comp AI',
    });
  });
});

describe('buildSendGridBody', () => {
  it('maps the message to the SendGrid v3 shape', () => {
    const body = buildSendGridBody({
      from: 'Comp AI <noreply@x.test>',
      to: 'a@x.test, b@x.test',
      cc: ['c@x.test', 'A@x.test'],
      replyTo: 'reply@x.test',
      subject: 'Hi',
      html: '<p>Hi</p>',
      headers: { 'List-Unsubscribe': '<https://x.test/u>' },
      sendAt: '2026-11-10T12:00:00.000Z',
      attachments: [
        { filename: 'a.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' },
        { filename: 'b.txt', content: 'YmFzZTY0' },
      ],
    });

    expect(body).toEqual({
      personalizations: [
        {
          to: [{ email: 'a@x.test' }, { email: 'b@x.test' }],
          // the duplicate of a "to" address is dropped, which SendGrid would reject
          cc: [{ email: 'c@x.test' }],
        },
      ],
      from: { email: 'noreply@x.test', name: 'Comp AI' },
      reply_to: { email: 'reply@x.test' },
      subject: 'Hi',
      content: [{ type: 'text/html', value: '<p>Hi</p>' }],
      headers: { 'List-Unsubscribe': '<https://x.test/u>' },
      send_at: 1794312000,
      attachments: [
        {
          filename: 'a.pdf',
          content: Buffer.from('pdf').toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        },
        { filename: 'b.txt', content: 'YmFzZTY0', disposition: 'attachment' },
      ],
    });
  });

  it('rejects a message with no recipients', () => {
    expect(() => buildSendGridBody({ from: 'a@x.test', to: ' ', subject: 's', html: 'h' })).toThrow(
      'no recipients',
    );
  });

  it('rejects an unparseable sendAt', () => {
    expect(() =>
      buildSendGridBody({ from: 'a@x.test', to: 'b@x.test', subject: 's', html: 'h', sendAt: 'soon' }),
    ).toThrow('Invalid sendAt');
  });
});

describe('sendWithSendGrid', () => {
  const message = { from: 'a@x.test', to: 'b@x.test', subject: 's', html: 'h' };

  beforeEach(() => vi.stubEnv('SENDGRID_API_KEY', 'SG.test'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts to SendGrid and returns the message id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 202, headers: { 'X-Message-Id': 'msg_1' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendWithSendGrid(message)).resolves.toEqual({ id: 'msg_1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.headers.Authorization).toBe('Bearer SG.test');
  });

  it('throws with the SendGrid error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"errors":[{"message":"bad from"}]}', { status: 400 })),
    );
    await expect(sendWithSendGrid(message)).rejects.toThrow('SendGrid error 400: {"errors"');
  });

  it('throws when the API key is missing', async () => {
    vi.stubEnv('SENDGRID_API_KEY', '');
    await expect(sendWithSendGrid(message)).rejects.toThrow('SENDGRID_API_KEY');
  });
});
