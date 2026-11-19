import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { PeopleLifecycleController } from './people-lifecycle.controller';

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('./member-compliance.service', () => ({ MemberComplianceService: class {} }));
jest.mock('./employee-reminders', () => ({ sendSecurityTaskReminders: jest.fn(), REMINDER_FREQUENCIES: ['off', 'weekly', 'daily'] }));
jest.mock('./reminder-settings', () => ({ getReminderFrequency: jest.fn(), setReminderFrequency: jest.fn() }));

describe('PeopleLifecycleController', () => {
  const proto = PeopleLifecycleController.prototype;

  it.each(['getOrgCompliance', 'getCompliance', 'getOnboarding', 'getOffboarding', 'getReminderSettings'] as const)(
    '%s requires member:read',
    (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[method])).toEqual([
      { resource: 'member', actions: ['read'] },
    ]);
    },
  );

  it.each(['sendReminders', 'setReminderSettings'] as const)('%s requires member:update', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[method])).toEqual([
      { resource: 'member', actions: ['update'] },
    ]);
  });

  it('returns the organization compliance as a list', async () => {
    const service = { getOrgCompliance: jest.fn().mockResolvedValue([{ member: { id: 'mem_1' } }]) };
    const controller = new PeopleLifecycleController(service as never);
    await expect(controller.getOrgCompliance('org_1')).resolves.toEqual({
      data: [{ member: { id: 'mem_1' } }],
      count: 1,
    });
    expect(service.getOrgCompliance).toHaveBeenCalledWith({ organizationId: 'org_1' });
  });

  it('asks for the onboarding checklist scoped to the organization', async () => {
    const service = { getChecklist: jest.fn() };
    const controller = new PeopleLifecycleController(service as never);
    await controller.getOnboarding('org_1', 'mem_1');
    expect(service.getChecklist).toHaveBeenCalledWith({ organizationId: 'org_1', memberId: 'mem_1', kind: 'onboarding' });
  });
});
