const mockDb = {
  task: { findFirst: jest.fn() },
  attachment: { findFirst: jest.fn(), update: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

import {
  attachmentValidInPeriod,
  resolveUploadValidity,
  updateAttachmentValidity,
} from './attachment-validity';

const d = (day: string) => new Date(`${day}T00:00:00.000Z`);
const period = { from: d('2026-01-01'), to: d('2026-12-31') };

describe('attachmentValidInPeriod', () => {
  it('keeps every file without a period', () => {
    expect(attachmentValidInPeriod({ createdAt: d('2020-01-01') }, {})).toBe(true);
  });

  it('uses the upload date for files without validity (legacy)', () => {
    expect(attachmentValidInPeriod({ createdAt: d('2025-06-01') }, period)).toBe(false);
    expect(attachmentValidInPeriod({ createdAt: d('2026-06-01') }, period)).toBe(true);
  });

  it('includes a file uploaded before the period but still valid in it', () => {
    const file = { createdAt: d('2025-10-01'), validFrom: d('2025-10-01'), validUntil: d('2026-04-01') };
    expect(attachmentValidInPeriod(file, period)).toBe(true);
  });

  it('excludes a file that expired before the period or starts after it', () => {
    expect(
      attachmentValidInPeriod(
        { createdAt: d('2025-01-01'), validFrom: d('2025-01-01'), validUntil: d('2025-12-31') },
        period,
      ),
    ).toBe(false);
    expect(
      attachmentValidInPeriod({ createdAt: d('2027-01-02'), validFrom: d('2027-01-02') }, period),
    ).toBe(false);
  });

  it('treats a file with no end date as valid from its start', () => {
    expect(
      attachmentValidInPeriod({ createdAt: d('2024-01-01'), validFrom: d('2024-01-01') }, period),
    ).toBe(true);
  });
});

describe('resolveUploadValidity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults task evidence to one task cycle', async () => {
    mockDb.task.findFirst.mockResolvedValue({ frequency: 'quarterly' });
    const result = await resolveUploadValidity({
      organizationId: 'org_1',
      entityType: 'task',
      entityId: 'tsk_1',
      validFrom: '2026-01-15',
    });
    expect(mockDb.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'tsk_1', organizationId: 'org_1' },
      select: { frequency: true },
    });
    expect(result.validFrom).toEqual(d('2026-01-15'));
    expect(result.validUntil?.getMonth()).toBe(3); // April
  });

  it('leaves non-task files open-ended and keeps explicit dates', async () => {
    const vendor = await resolveUploadValidity({
      organizationId: 'org_1',
      entityType: 'vendor',
      entityId: 'vnd_1',
      now: d('2026-02-01'),
    });
    expect(vendor).toEqual({ validFrom: d('2026-02-01'), validUntil: null });
    expect(mockDb.task.findFirst).not.toHaveBeenCalled();

    const explicit = await resolveUploadValidity({
      organizationId: 'org_1',
      entityType: 'task',
      entityId: 'tsk_1',
      validFrom: '2026-01-01',
      validUntil: '2026-03-31',
    });
    expect(explicit.validUntil).toEqual(d('2026-03-31'));
  });

  it('rejects an end before the start', async () => {
    await expect(
      resolveUploadValidity({
        organizationId: 'org_1',
        entityType: 'vendor',
        entityId: 'vnd_1',
        validFrom: '2026-03-01',
        validUntil: '2026-02-01',
      }),
    ).rejects.toThrow('validUntil must be after validFrom');
  });
});

describe('updateAttachmentValidity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is scoped to the organization', async () => {
    mockDb.attachment.findFirst.mockResolvedValue(null);
    await expect(
      updateAttachmentValidity({ organizationId: 'org_1', attachmentId: 'att_x', validUntil: null }),
    ).rejects.toThrow('Attachment not found');
    expect(mockDb.attachment.findFirst.mock.calls[0][0].where).toEqual({
      id: 'att_x',
      organizationId: 'org_1',
    });
  });

  it('clears the end date with null and keeps the start', async () => {
    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_1',
      createdAt: d('2026-01-01'),
      validFrom: d('2026-01-02'),
      validUntil: d('2026-04-02'),
    });
    mockDb.attachment.update.mockResolvedValue({});
    await updateAttachmentValidity({ organizationId: 'org_1', attachmentId: 'att_1', validUntil: null });
    expect(mockDb.attachment.update.mock.calls[0][0].data).toEqual({
      validFrom: d('2026-01-02'),
      validUntil: null,
    });
  });
});
