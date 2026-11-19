const mockDb = {
  member: { findFirst: jest.fn(), findMany: jest.fn() },
  trainingModule: { findMany: jest.fn() },
  employeeTrainingVideoCompletion: { findMany: jest.fn(), upsert: jest.fn() },
  trainingCompletionRecord: { createMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('@trycompai/company', () => ({
  GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'],
  HIPAA_TRAINING_ID: 'hipaa-sat-1',
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { TrainingRecordsController } from './training-records.controller';
import { resolveModuleKey, TrainingRecordsService } from './training-records.service';

const ORG = 'org_1';

describe('TrainingRecordsService (#94, #179)', () => {
  const attachments = { uploadAttachment: jest.fn().mockResolvedValue({ id: 'att_1' }) };
  const service = new TrainingRecordsService(attachments as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1', role: 'employee', department: 'it' });
    mockDb.trainingModule.findMany.mockResolvedValue([
      { id: 'trm_dev', title: 'Secure coding', targetRoles: [], targetDepartments: ['it'], recurrenceMonths: 24 },
      { id: 'trm_hr', title: 'HR privacy', targetRoles: [], targetDepartments: ['hr'], recurrenceMonths: 12 },
    ]);
    mockDb.employeeTrainingVideoCompletion.findMany.mockResolvedValue([
      { videoId: 'sat-1', completedAt: new Date('2026-09-01') },
    ]);
  });

  it('resolves training names from a CSV', () => {
    const modules = [{ id: 'trm_dev', title: 'Secure coding' }];
    expect(resolveModuleKey({ value: 'Security Awareness Training', modules })).toBe('general');
    expect(resolveModuleKey({ value: 'HIPAA', modules })).toBe('hipaa');
    expect(resolveModuleKey({ value: ' secure coding ', modules })).toBe('trm_dev');
    expect(resolveModuleKey({ value: 'Unknown', modules })).toBeNull();
  });

  it('records security awareness training for every video, with the certificate, without moving newer dates back', async () => {
    await service.record({
      organizationId: ORG,
      memberId: 'mem_1',
      userId: 'usr_1',
      dto: { module: 'general', completedAt: '2026-06-01', fileName: 'cert.pdf', fileType: 'application/pdf', fileData: 'aGk=' },
    });
    expect(attachments.uploadAttachment).toHaveBeenCalledWith(ORG, 'mem_1', 'training_record', expect.anything(), 'usr_1');
    const { data } = mockDb.trainingCompletionRecord.createMany.mock.calls[0][0];
    expect(data.map((r: { moduleId: string }) => r.moduleId)).toEqual(['sat-1', 'sat-2']);
    expect(data[0]).toMatchObject({ organizationId: ORG, attachmentId: 'att_1', source: 'admin' });
    expect(data[0].expiresAt).toEqual(new Date('2027-06-01'));
    // sat-1 was completed later in the portal, so only sat-2 moves.
    expect(mockDb.employeeTrainingVideoCompletion.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.employeeTrainingVideoCompletion.upsert.mock.calls[0][0].where).toEqual({
      memberId_videoId: { memberId: 'mem_1', videoId: 'sat-2' },
    });
  });

  it('rejects future dates and modules not assigned to the member', async () => {
    await expect(
      service.record({ organizationId: ORG, memberId: 'mem_1', dto: { module: 'general', completedAt: '2999-01-01' } }),
    ).rejects.toThrow('cannot be in the future');
    await expect(
      service.record({ organizationId: ORG, memberId: 'mem_1', dto: { module: 'HR privacy', completedAt: '2026-01-01' } }),
    ).rejects.toThrow('not assigned');
  });

  it('records a role-based module with its own recurrence', async () => {
    await service.record({ organizationId: ORG, memberId: 'mem_1', dto: { module: 'Secure coding', completedAt: '2026-01-01' } });
    const { data } = mockDb.trainingCompletionRecord.createMany.mock.calls[0][0];
    expect(data).toEqual([expect.objectContaining({ moduleId: 'trm_dev', expiresAt: new Date('2028-01-01') })]);
    expect(mockDb.employeeTrainingVideoCompletion.upsert).not.toHaveBeenCalled();
  });

  it('imports CSV rows by email and reports the rows it could not match', async () => {
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_1', user: { email: 'Jane@acme.com' } }]);
    const result = await service.import({
      organizationId: ORG,
      rows: [
        { email: 'jane@acme.com', module: 'Security awareness', completedAt: '2026-05-01' },
        { email: 'ghost@acme.com', module: 'Security awareness', completedAt: '2026-05-01' },
        { email: 'jane@acme.com', module: 'Basket weaving', completedAt: '2026-05-01' },
      ],
    });
    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([
      { row: 2, message: 'No member with email ghost@acme.com' },
      { row: 3, message: 'Unknown training "Basket weaving"' },
    ]);
    expect(mockDb.member.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG } }));
  });
});

describe('TrainingRecordsController permissions', () => {
  const perm = (method: keyof TrainingRecordsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, TrainingRecordsController.prototype[method]);

  it('reads need training:read, writes need training:update, the portal certificate needs portal:read', () => {
    expect(perm('list')).toEqual([{ resource: 'training', actions: ['read'] }]);
    expect(perm('record')).toEqual([{ resource: 'training', actions: ['update'] }]);
    expect(perm('import')).toEqual([{ resource: 'training', actions: ['update'] }]);
    expect(perm('myCertificate')).toEqual([{ resource: 'portal', actions: ['read'] }]);
  });
});
