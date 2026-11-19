import { NotFoundException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { OffboardingChecklistController } from './offboarding-checklist.controller';
import { db } from '@db';

const mockDb = db as unknown as { member: { count: jest.Mock }; organization: { findFirst: jest.Mock } };

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('@db', () => ({ db: { member: { count: jest.fn() }, organization: { findFirst: jest.fn() } } }));
jest.mock('./offboarding-checklist.service', () => ({ OffboardingChecklistService: class {} }));
jest.mock('./offboarding-export.service', () => ({ OffboardingExportService: class {} }));

describe('OffboardingChecklistController export-all (#85)', () => {
  const exportAllOffboardings = jest.fn();
  const controller = new OffboardingChecklistController({} as never, { exportAllOffboardings } as never);
  const res = { set: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('requires member:read', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, OffboardingChecklistController.prototype.exportAllEvidence)).toEqual([
      { resource: 'member', actions: ['read'] },
    ]);
  });

  it('answers 404 when nobody has an offboard date', async () => {
    mockDb.member.count.mockResolvedValueOnce(0);
    await expect(controller.exportAllEvidence('org_1', res as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.member.count).toHaveBeenCalledWith({ where: { organizationId: 'org_1', offboardDate: { not: null } } });
    expect(exportAllOffboardings).not.toHaveBeenCalled();
  });

  it('streams the zip for the organization otherwise', async () => {
    mockDb.member.count.mockResolvedValueOnce(2);
    mockDb.organization.findFirst.mockResolvedValueOnce({ name: 'Spare' });
    await controller.exportAllEvidence('org_1', res as never);
    expect(exportAllOffboardings).toHaveBeenCalledWith({ organizationId: 'org_1', output: res });
  });
});
