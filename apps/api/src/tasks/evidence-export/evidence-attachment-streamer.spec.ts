import archiver from 'archiver';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';

const mockSend = jest.fn();
jest.mock('../../app/s3', () => ({
  s3Client: { send: (...args: unknown[]) => mockSend(...args) },
  BUCKET_NAME: 'bucket',
}));
jest.mock('@db', () => ({ db: {}, AttachmentEntityType: { task: 'task' } }));

import { appendAttachmentToArchive } from './evidence-attachment-streamer';

type FakeArchive = EventEmitter & { append: jest.Mock; destroyed: boolean };

function fakeArchive(): FakeArchive {
  return Object.assign(new EventEmitter(), { append: jest.fn(), destroyed: false });
}

const append = (archive: unknown, id = 'att_1') =>
  appendAttachmentToArchive({
    archive: archive as import('archiver').Archiver,
    attachment: { id, name: `${id}.txt`, url: `key/${id}` },
    folderPath: 'f',
    uniqueName: (name) => name,
  });

describe('appendAttachmentToArchive', () => {
  beforeEach(() => mockSend.mockReset());

  it('keeps at most one S3 body open while a real archive consumes them', async () => {
    let open = 0;
    let maxOpen = 0;
    mockSend.mockImplementation(async () => {
      open += 1;
      maxOpen = Math.max(maxOpen, open);
      const body = Readable.from([Buffer.alloc(64 * 1024, 1)]);
      body.once('end', () => (open -= 1));
      return { Body: body };
    });
    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.pipe(new Writable({ write: (_chunk, _enc, cb) => setImmediate(cb) }));

    for (let i = 0; i < 20; i += 1) await append(archive, `att_${i}`);
    await archive.finalize();

    expect(mockSend).toHaveBeenCalledTimes(20);
    expect(maxOpen).toBe(1);
  });

  it('resolves only after the archive has read the body', async () => {
    const body = new PassThrough();
    mockSend.mockResolvedValue({ Body: body });
    const archive = fakeArchive();
    let done = false;

    const pending = append(archive).then(() => (done = true));
    await new Promise((r) => setImmediate(r));
    expect(archive.append).toHaveBeenCalledWith(body, { name: 'f/att_1.txt' });
    expect(done).toBe(false);

    body.resume();
    body.end('data');
    await pending;
    expect(done).toBe(true);
  });

  it('destroys the unread body when the archive is destroyed (client disconnect)', async () => {
    const body = new PassThrough();
    mockSend.mockResolvedValue({ Body: body });
    const archive = fakeArchive();

    const pending = append(archive);
    await new Promise((r) => setImmediate(r));
    archive.destroyed = true;
    archive.emit('close');

    await expect(pending).rejects.toThrow();
    expect(body.destroyed).toBe(true);
  });

  it('does not open an S3 body once the archive is destroyed', async () => {
    const archive = fakeArchive();
    archive.destroyed = true;

    await expect(append(archive)).rejects.toThrow('export cancelled');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('writes a placeholder without waiting when the object is missing', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NoSuchKey' }));
    const archive = fakeArchive();

    await append(archive);

    expect(archive.append).toHaveBeenCalledWith(expect.stringContaining('Attachment missing'), {
      name: 'f/_MISSING_att_1.txt.txt',
    });
  });
});
