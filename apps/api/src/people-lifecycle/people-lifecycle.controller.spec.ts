import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { PeopleLifecycleController } from './people-lifecycle.controller';

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('./member-compliance.service', () => ({ MemberComplianceService: class {} }));

describe('PeopleLifecycleController', () => {
  const proto = PeopleLifecycleController.prototype;

  it.each(['getCompliance', 'getOnboarding', 'getOffboarding'] as const)('%s requires member:read', (method) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[method])).toEqual([
      { resource: 'member', actions: ['read'] },
    ]);
  });

  it('asks for the onboarding checklist scoped to the organization', async () => {
    const service = { getChecklist: jest.fn() };
    const controller = new PeopleLifecycleController(service as never);
    await controller.getOnboarding('org_1', 'mem_1');
    expect(service.getChecklist).toHaveBeenCalledWith({ organizationId: 'org_1', memberId: 'mem_1', kind: 'onboarding' });
  });
});
