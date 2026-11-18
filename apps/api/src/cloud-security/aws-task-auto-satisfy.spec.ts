jest.mock('@db', () => ({
  ...jest.requireActual('@prisma/client'),
  db: {
    task: { findMany: jest.fn(), updateMany: jest.fn() },
    integrationCheckRun: { findFirst: jest.fn(), create: jest.fn() },
    integrationCheckResult: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { db } from '@db';
import {
  AWS_TASK_EVIDENCE_CHECK_ID,
  autoSatisfyAwsTasks,
  groupFindingsByService,
  planAwsTaskUpdates,
} from './aws-task-auto-satisfy';
import type { SecurityFinding } from './cloud-security.service';

const EMPLOYEE_ACCESS = 'frk_tt_68406ca292d9fffb264991b9';
const RBAC = 'frk_tt_68e80544d9734e0402cfa807';
const ACCESS_REVIEW_LOG = 'frk_tt_68e805457c2dcc784e72e3cc';
const INCIDENT_RESPONSE = 'frk_tt_68406b4f40c87c12ae0479ce';
const INTERNAL_SECURITY_AUDIT = 'frk_tt_68e52b2618cb9d9722c6edfd';

const finding = (serviceId: string, passed: boolean): SecurityFinding => ({
  id: `${serviceId}-${passed}`,
  title: `${serviceId} check`,
  description: '',
  severity: 'medium',
  resourceType: 'aws',
  resourceId: `${serviceId}-res`,
  evidence: { serviceId },
  createdAt: '2026-11-18T00:00:00.000Z',
  passed,
});

const plan = (findings: SecurityFinding[]) =>
  planAwsTaskUpdates(groupFindingsByService(findings));

describe('planAwsTaskUpdates', () => {
  it('IAM pass satisfies Employee Access + RBAC; Access Review Log is evidence-only', () => {
    const { satisfy, attachOnly } = plan([finding('iam-analyzer', true)]);
    expect([...satisfy.keys()].sort()).toEqual([EMPLOYEE_ACCESS, RBAC].sort());
    expect(satisfy.has(ACCESS_REVIEW_LOG)).toBe(false);
    expect(attachOnly.get(ACCESS_REVIEW_LOG)).toEqual(['iam-analyzer']);
  });

  it('GuardDuty never satisfies Incident Response, only attaches evidence', () => {
    const { satisfy, attachOnly } = plan([finding('guardduty', true)]);
    expect(satisfy.has(INCIDENT_RESPONSE)).toBe(false);
    expect(attachOnly.get(INCIDENT_RESPONSE)).toEqual(['guardduty']);
  });

  it('Config / Inspector do not map to Internal Security Audit', () => {
    const { satisfy, attachOnly } = plan([finding('config', true), finding('inspector', true)]);
    expect(satisfy.has(INTERNAL_SECURITY_AUDIT)).toBe(false);
    expect(attachOnly.has(INTERNAL_SECURITY_AUDIT)).toBe(false);
  });

  it('a failing finding blocks satisfaction but still attaches evidence-only results', () => {
    const { satisfy, attachOnly } = plan([
      finding('iam-analyzer', true),
      finding('iam-analyzer', false),
    ]);
    expect(satisfy.size).toBe(0);
    expect(attachOnly.has(ACCESS_REVIEW_LOG)).toBe(true);
  });
});

describe('autoSatisfyAwsTasks', () => {
  const findMany = db.task.findMany as jest.Mock;
  const updateMany = db.task.updateMany as jest.Mock;
  const runFindFirst = db.integrationCheckRun.findFirst as jest.Mock;
  const runCreate = db.integrationCheckRun.create as jest.Mock;
  const now = new Date(2026, 10, 18);

  beforeEach(() => {
    jest.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    runFindFirst.mockResolvedValue(null);
    runCreate.mockResolvedValue({ id: 'run_1' });
    (db.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
  });

  const run = () =>
    autoSatisfyAwsTasks({
      organizationId: 'org_1',
      connectionId: 'conn_1',
      findings: [finding('iam-analyzer', true)],
      now,
    });

  it('moves a MANUAL task to in_review and an AUTOMATED one to done, attaching results', async () => {
    findMany.mockResolvedValue([
      { id: 'tsk_rbac', status: 'todo', taskTemplateId: RBAC, frequency: 'quarterly', automationStatus: 'MANUAL' },
      { id: 'tsk_emp', status: 'todo', taskTemplateId: EMPLOYEE_ACCESS, frequency: 'yearly', automationStatus: 'AUTOMATED' },
    ]);

    await run();

    const byId = Object.fromEntries(
      updateMany.mock.calls.map(([arg]) => [arg.where.id, arg.data]),
    );
    expect(byId.tsk_rbac).toEqual({ status: 'in_review' });
    expect(byId.tsk_emp).toMatchObject({ status: 'done', lastCompletedAt: now });
    expect(byId.tsk_emp.reviewDate).toEqual(new Date(2027, 10, 18));
    expect(runCreate).toHaveBeenCalledTimes(2);
    expect(runCreate.mock.calls[0][0].data).toMatchObject({
      taskId: 'tsk_rbac',
      checkId: AWS_TASK_EVIDENCE_CHECK_ID,
      status: 'success',
      scanMode: 'task_evidence',
    });
  });

  it('never changes the status of an evidence-only task, and attaches at most once a day', async () => {
    findMany.mockResolvedValue([
      { id: 'tsk_arl', status: 'todo', taskTemplateId: ACCESS_REVIEW_LOG, frequency: 'quarterly', automationStatus: 'MANUAL' },
    ]);

    await run();
    expect(updateMany).not.toHaveBeenCalled();
    expect(runCreate).toHaveBeenCalledTimes(1);

    runFindFirst.mockResolvedValue({ id: 'run_today' });
    await run();
    expect(runCreate).toHaveBeenCalledTimes(1);
  });

  it('only queries open tasks of the org (done / not_relevant are never touched)', async () => {
    findMany.mockResolvedValue([]);
    await run();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      archivedAt: null,
      status: { in: ['todo', 'in_progress', 'failed', 'in_review'] },
    });
  });
});
