import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { TrainingModulesController } from './training-modules.controller';

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('@db', () => ({ db: {}, Departments: { none: 'none', it: 'it' } }));

describe('TrainingModulesController permissions', () => {
  const proto = TrainingModulesController.prototype;
  const perm = (handler: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, handler as object);

  it.each([
    ['listModules', 'read'],
    ['getMemberModules', 'read'],
    ['getCycles', 'read'],
    ['getCycleCertificate', 'read'],
    ['createModule', 'update'],
    ['updateModule', 'update'],
    ['disableModule', 'update'],
    ['completeModule', 'update'],
  ] as const)('%s requires training:%s', (method, action) => {
    expect(perm(proto[method])).toEqual([{ resource: 'training', actions: [action] }]);
  });

  it('passes the parsed completion date to the service', async () => {
    const modulesService = { completeModule: jest.fn() };
    const controller = new TrainingModulesController(modulesService as never, {} as never);
    await controller.completeModule('org_1', 'mem_1', 'trm_1', { completedAt: '2026-03-01' });
    expect(modulesService.completeModule).toHaveBeenCalledWith({
      organizationId: 'org_1',
      memberId: 'mem_1',
      moduleId: 'trm_1',
      completedAt: new Date('2026-03-01'),
    });
  });
});
