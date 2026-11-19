import { BadRequestException } from '@nestjs/common';

const mockDb = {
  member: { findFirst: jest.fn() },
  evidenceFormSetting: { upsert: jest.fn((args: unknown) => args) },
  asset: { count: jest.fn() },
  accessSystemRole: { count: jest.fn() },
  ismsManagementReview: { count: jest.fn() },
  task: { findFirst: jest.fn() },
  attachment: { count: jest.fn() },
  vulnerabilityScan: { findFirst: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@/auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));

import { PERMISSIONS_KEY } from '@/auth/permission.guard';
import { EvidenceFormsSettingsController } from './evidence-forms-settings.controller';
import { formDeadlineStatus } from './form-deadlines';
import { bulkSetFormOwner, getFormModuleStatus } from './form-settings';

beforeEach(() => jest.clearAllMocks());

describe('form retirement (#130)', () => {
  it('points the inventory form at Assets with the module’s record count', async () => {
    mockDb.asset.count.mockResolvedValue(12);
    const status = await getFormModuleStatus({ organizationId: 'org_1', formType: 'infrastructure-inventory' });
    expect(status).toEqual({ successor: { label: 'Assets', path: '/assets', recordCount: 12 }, latestPentest: null });
    expect(mockDb.asset.count).toHaveBeenCalledWith({ where: { organizationId: 'org_1', archivedAt: null } });
  });

  it('reports an empty module so the form stays the place to record evidence', async () => {
    mockDb.accessSystemRole.count.mockResolvedValue(0);
    const status = await getFormModuleStatus({ organizationId: 'org_1', formType: 'rbac-matrix' });
    expect(status.successor).toMatchObject({ label: 'People > Access', recordCount: 0 });
  });

  it('links the network diagram to the Diagramming task of this org', async () => {
    mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_d' });
    mockDb.attachment.count.mockResolvedValue(3);
    const status = await getFormModuleStatus({ organizationId: 'org_1', formType: 'network-diagram' });
    expect(status.successor).toMatchObject({ path: '/tasks/tsk_d', recordCount: 3 });
    expect(mockDb.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org_1' }) }));
  });

  it('shows the latest pentest on the penetration test form, which is not retired', async () => {
    const scan = { id: 'vs_1', vendor: 'Acme', scannedAt: new Date('2026-06-01'), passed: true, findingCount: 2 };
    mockDb.vulnerabilityScan.findFirst.mockResolvedValue(scan);
    const status = await getFormModuleStatus({ organizationId: 'org_1', formType: 'penetration-test' });
    expect(status).toEqual({ successor: null, latestPentest: scan });
  });
});

describe('bulkSetFormOwner (#50)', () => {
  it('upserts the owner on every form of the org', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_1' });
    const result = await bulkSetFormOwner({ organizationId: 'org_1', formTypes: ['penetration-test', 'meeting'], ownerMemberId: 'mem_1' });
    expect(result).toEqual({ updatedCount: 2 });
    expect(mockDb.member.findFirst).toHaveBeenCalledWith({ where: { id: 'mem_1', organizationId: 'org_1', deactivated: false }, select: { id: true } });
    expect(mockDb.evidenceFormSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects an owner from another organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      bulkSetFormOwner({ organizationId: 'org_1', formTypes: ['meeting'], ownerMemberId: 'mem_x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.evidenceFormSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('formDeadlineStatus (#136)', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  it('classifies forms by their next due date', () => {
    expect(formDeadlineStatus({ isNotRelevant: true, nextDueAt: null, now })).toBe('not_relevant');
    expect(formDeadlineStatus({ isNotRelevant: false, nextDueAt: null, now })).toBe('never_submitted');
    expect(formDeadlineStatus({ isNotRelevant: false, nextDueAt: new Date('2026-11-01'), now })).toBe('overdue');
    expect(formDeadlineStatus({ isNotRelevant: false, nextDueAt: new Date('2026-12-01'), now })).toBe('due_soon');
    expect(formDeadlineStatus({ isNotRelevant: false, nextDueAt: new Date('2027-06-01'), now })).toBe('ok');
  });
});

describe('EvidenceFormsSettingsController permissions', () => {
  const required = (method: keyof EvidenceFormsSettingsController) =>
    Reflect.getMetadata(PERMISSIONS_KEY, EvidenceFormsSettingsController.prototype[method]);
  it('needs evidence:update to set owners and evidence:read for module status', () => {
    expect(required('bulkSetOwner')).toEqual([{ resource: 'evidence', actions: ['update'] }]);
    expect(required('getModuleStatus')).toEqual([{ resource: 'evidence', actions: ['read'] }]);
  });
});
