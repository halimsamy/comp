// schemaTask() returns its config so the specs can call run() directly.
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  queue: (config: unknown) => config,
  schemaTask: (config: unknown) => config,
}));

const mockSendWithSendGrid = jest.fn();
jest.mock('@trycompai/email', () => ({
  generateUnsubscribeToken: () => 'tok',
  sendWithSendGrid: (...args: unknown[]) => mockSendWithSendGrid(...args),
}));

import { sendBatchEmailTask } from './send-batch-email';
import { sendEmailTask } from './send-email';

type Run<P, R> = { run: (params: P) => Promise<R> };

const sendEmail = sendEmailTask as unknown as Run<
  Record<string, unknown>,
  { id: string | undefined }
>;
const sendBatch = sendBatchEmailTask as unknown as Run<
  { emails: { to: string; subject: string; html: string }[] },
  { totalSent: number; totalFailed: number }
>;

describe('email tasks (SendGrid)', () => {
  const env = process.env;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    mockSendWithSendGrid.mockReset();
    process.env = {
      ...env,
      EMAIL_FROM_SYSTEM: 'Comp AI <noreply@x.test>',
      EMAIL_FROM_TRUST_PORTAL: 'Trust <trust@x.test>',
      EMAIL_TO_TEST: '',
    };
    delete process.env.EMAIL_TO_TEST;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = env;
  });

  it('send-email sends through SendGrid with the channel sender and unsubscribe headers', async () => {
    mockSendWithSendGrid.mockResolvedValue({ id: 'msg_1' });

    const promise = sendEmail.run({
      to: 'a@x.test',
      subject: 'Hi',
      html: '<p>Hi</p>',
      channel: 'trustPortal',
      scheduledAt: '2026-11-10T12:00:00.000Z',
    });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ id: 'msg_1' });
    expect(mockSendWithSendGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Trust <trust@x.test>',
        to: 'a@x.test',
        sendAt: '2026-11-10T12:00:00.000Z',
        headers: expect.objectContaining({
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    );
  });

  it('send-email rethrows SendGrid failures so the job retries', async () => {
    mockSendWithSendGrid.mockRejectedValue(new Error('SendGrid error 500: boom'));

    await expect(
      sendEmail.run({ to: 'a@x.test', subject: 'Hi', html: 'h' }),
    ).rejects.toThrow('SendGrid error 500');
  });

  it('send-batch-email sends each email and counts failures', async () => {
    mockSendWithSendGrid
      .mockResolvedValueOnce({ id: '1' })
      .mockRejectedValueOnce(new Error('bad address'))
      .mockResolvedValueOnce({ id: '3' });

    const result = await sendBatch.run({
      emails: ['a', 'b', 'c'].map((n) => ({
        to: `${n}@x.test`,
        subject: 's',
        html: 'h',
      })),
    });

    expect(result).toEqual({ totalSent: 2, totalFailed: 1 });
    expect(mockSendWithSendGrid).toHaveBeenCalledTimes(3);
    expect(mockSendWithSendGrid).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Comp AI <noreply@x.test>', to: 'b@x.test' }),
    );
  });
});
