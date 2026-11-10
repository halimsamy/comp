import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RemediationBatchService } from './remediation-batch.service';

jest.mock('@db', () => ({
  db: {
    integrationConnection: { findFirst: jest.fn() },
    integrationCheckResult: { findMany: jest.fn() },
    remediationBatch: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock('@trycompai/jobs', () => ({
  runs: { retrieve: jest.fn(), cancel: jest.fn() },
}));
jest.mock('./cloud-security-audit', () => ({
  logCloudSecurityActivity: jest.fn(),
}));

type MockDb = {
  integrationConnection: { findFirst: jest.Mock };
  integrationCheckResult: { findMany: jest.Mock };
  remediationBatch: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};
const db = jest.requireMock<{ db: MockDb }>('@db').db;
const sdk = jest.requireMock<{
  runs: { retrieve: jest.Mock; cancel: jest.Mock };
}>('@trycompai/jobs');

const batch = {
  id: 'rmb_own',
  organizationId: 'org_own',
  connectionId: 'conn_own',
  initiatedById: 'usr_own',
  triggerRunId: 'run_own',
  status: 'running',
  findings: [
    { id: 'finding_own', key: 'fix-key', title: 'Finding', status: 'pending' },
  ],
};
const run = {
  taskIdentifier: 'remediate-batch',
  organizationId: 'org_own',
  tags: ['org_own', 'batch:rmb_own', 'connection:conn_own'],
};
const createInput = {
  organizationId: 'org_own',
  userId: 'usr_own',
  body: {
    connectionId: 'conn_own',
    findings: [{ id: 'finding_own', key: 'fix-key', title: 'Finding' }],
  },
};

describe('RemediationBatchService tenant isolation', () => {
  const service = new RemediationBatchService();

  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((action: (tx: MockDb) => unknown) =>
      action(db),
    );
    db.integrationConnection.findFirst.mockResolvedValue({ id: 'conn_own' });
    db.integrationCheckResult.findMany.mockResolvedValue([
      { id: 'finding_own' },
    ]);
    db.remediationBatch.findFirst.mockResolvedValue(batch);
    db.remediationBatch.create.mockResolvedValue(batch);
    db.remediationBatch.update.mockResolvedValue(batch);
    db.remediationBatch.updateMany.mockResolvedValue({ count: 1 });
    sdk.runs.retrieve.mockResolvedValue(run);
    sdk.runs.cancel.mockResolvedValue({ id: 'run_own' });
  });

  it('creates a batch only after checking its connection and all findings in the authenticated organization', async () => {
    await service.create(createInput);
    expect(db.integrationConnection.findFirst).toHaveBeenCalledWith({
      where: { id: 'conn_own', organizationId: 'org_own', status: 'active' },
      select: { id: true },
    });
    expect(db.integrationCheckResult.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['finding_own'] },
        checkRun: {
          connectionId: 'conn_own',
          connection: { organizationId: 'org_own' },
        },
      },
      select: { id: true },
    });
    expect(db.remediationBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_own',
        connectionId: 'conn_own',
      }),
    });
  });

  it('rejects a foreign or inactive connection without persisting a batch', async () => {
    db.integrationConnection.findFirst.mockResolvedValue(null);
    await expect(service.create(createInput)).rejects.toThrow(
      NotFoundException,
    );
    expect(db.remediationBatch.create).not.toHaveBeenCalled();
  });

  it('rejects foreign or missing finding IDs without persisting a batch', async () => {
    db.integrationCheckResult.findMany.mockResolvedValue([]);
    await expect(service.create(createInput)).rejects.toThrow(
      NotFoundException,
    );
    expect(db.remediationBatch.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate findings rather than executing the same fix twice', async () => {
    await expect(
      service.create({
        ...createInput,
        body: {
          ...createInput.body,
          findings: [
            ...createInput.body.findings,
            ...createInput.body.findings,
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(db.remediationBatch.create).not.toHaveBeenCalled();
  });

  it('binds only a real run with matching task, organization, and batch tags', async () => {
    db.remediationBatch.findFirst.mockResolvedValue({
      ...batch,
      triggerRunId: null,
    });
    await service.update({
      batchId: 'rmb_own',
      organizationId: 'org_own',
      body: { triggerRunId: 'run_own', status: 'running' },
    });
    expect(sdk.runs.retrieve).toHaveBeenCalledWith('run_own');
    expect(db.remediationBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'rmb_own',
          organizationId: 'org_own',
          triggerRunId: null,
          status: 'running',
        },
      }),
    );
  });

  it.each([
    { ...run, taskIdentifier: 'other-task' },
    { ...run, organizationId: 'org_foreign' },
    { ...run, tags: ['org_own', 'batch:rmb_foreign', 'connection:conn_own'] },
    { ...run, tags: ['org_own', 'batch:rmb_own', 'connection:conn_foreign'] },
    { ...run, tags: ['org_own'] },
  ])('refuses forged run binding: %p', async (foreignRun) => {
    db.remediationBatch.findFirst.mockResolvedValue({
      ...batch,
      triggerRunId: null,
    });
    sdk.runs.retrieve.mockResolvedValue(foreignRun);
    await expect(
      service.update({
        batchId: 'rmb_own',
        organizationId: 'org_own',
        body: { triggerRunId: 'run_foreign' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(db.remediationBatch.update).not.toHaveBeenCalled();
  });

  it('does not allow replacing an existing run binding', async () => {
    await expect(
      service.update({
        batchId: 'rmb_own',
        organizationId: 'org_own',
        body: { triggerRunId: 'run_different' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(sdk.runs.retrieve).not.toHaveBeenCalled();
  });

  it('cancels only the bound, validated run in the caller organization', async () => {
    await service.cancel({
      batchId: 'rmb_own',
      organizationId: 'org_own',
      runId: 'run_own',
    });
    expect(db.remediationBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'rmb_own', organizationId: 'org_own' },
    });
    expect(sdk.runs.cancel).toHaveBeenCalledWith('run_own');
    expect(db.remediationBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'rmb_own',
        organizationId: 'org_own',
        triggerRunId: 'run_own',
        status: { in: ['pending', 'running'] },
      },
      data: { status: 'cancelled' },
    });
  });

  it('refuses cancellation of an unrelated run', async () => {
    await expect(
      service.cancel({
        batchId: 'rmb_own',
        organizationId: 'org_own',
        runId: 'run_foreign',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(sdk.runs.cancel).not.toHaveBeenCalled();
  });

  it('refuses reads and cancellation of a foreign batch', async () => {
    db.remediationBatch.findFirst.mockResolvedValue(null);
    await expect(
      service.cancel({
        batchId: 'rmb_foreign',
        organizationId: 'org_own',
        runId: 'run_foreign',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(sdk.runs.retrieve).not.toHaveBeenCalled();
    expect(sdk.runs.cancel).not.toHaveBeenCalled();
  });

  it('does not mark a batch cancelled when the SDK rejects cancellation', async () => {
    sdk.runs.cancel.mockRejectedValue(new Error('SDK unavailable'));
    await expect(
      service.cancel({
        batchId: 'rmb_own',
        organizationId: 'org_own',
        runId: 'run_own',
      }),
    ).rejects.toThrow('SDK unavailable');
    expect(db.remediationBatch.update).not.toHaveBeenCalled();
  });
});
