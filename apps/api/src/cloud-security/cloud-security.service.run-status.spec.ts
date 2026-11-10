const mockFindFirst = jest.fn();
jest.mock('@db', () => ({
  db: { integrationConnection: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } },
  Prisma: {},
}));

const mockRetrieve = jest.fn();
jest.mock('@trycompai/jobs', () => ({
  runs: { retrieve: (...a: unknown[]) => mockRetrieve(...a) },
  tasks: { trigger: jest.fn() },
}));

jest.mock('@trycompai/integration-platform', () => ({}));

import {
  CloudSecurityService,
  ConnectionNotFoundError,
} from './cloud-security.service';

type Ctor = ConstructorParameters<typeof CloudSecurityService>;

describe('CloudSecurityService.getRunStatus', () => {
  const service = new CloudSecurityService(
    {} as unknown as Ctor[0],
    {} as unknown as Ctor[1],
    {} as unknown as Ctor[2],
    {} as unknown as Ctor[3],
    {} as unknown as Ctor[4],
    {} as unknown as Ctor[5],
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue({ id: 'icn_1' });
  });

  const scanRun = {
    organizationId: 'org_1',
    taskIdentifier: 'run-cloud-security-scan',
    tags: ['connection:icn_1'],
  };

  it('returns the run state for a run owned by the organization', async () => {
    mockRetrieve.mockResolvedValue({
      ...scanRun,
      isCompleted: true,
      isSuccess: true,
      output: { ok: 1 },
    });

    await expect(
      service.getRunStatus('jrun_1', 'icn_1', 'org_1'),
    ).resolves.toEqual({ completed: true, success: true, output: { ok: 1 } });
  });

  it('rejects a run that belongs to another organization', async () => {
    mockRetrieve.mockResolvedValue({
      ...scanRun,
      organizationId: 'org_other',
      isCompleted: true,
      isSuccess: true,
      output: { secret: true },
    });

    await expect(
      service.getRunStatus('jrun_1', 'icn_1', 'org_1'),
    ).rejects.toBeInstanceOf(ConnectionNotFoundError);
  });

  it.each([
    ['another task in the same org', { taskIdentifier: 'export-organization-evidence', tags: [] }],
    ['a scan of another connection', { tags: ['connection:icn_2'] }],
  ])('rejects %s', async (_label, overrides) => {
    mockRetrieve.mockResolvedValue({
      ...scanRun,
      ...overrides,
      isCompleted: true,
      isSuccess: true,
      output: { downloadUrl: 'https://s3/evidence.zip' },
    });

    await expect(
      service.getRunStatus('jrun_1', 'icn_1', 'org_1'),
    ).rejects.toBeInstanceOf(ConnectionNotFoundError);
  });

  it('rejects when the connection is not in the organization', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      service.getRunStatus('jrun_1', 'icn_1', 'org_1'),
    ).rejects.toBeInstanceOf(ConnectionNotFoundError);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
