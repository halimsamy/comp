import { SKIP_AUDIT_LOG_KEY } from '../audit/skip-audit-log.decorator';
import { SOAController } from './soa.controller';

jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('../auth/hybrid-auth.guard', () => ({
  HybridAuthGuard: class MockHybridAuthGuard {},
}));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class MockPermissionGuard {},
}));
jest.mock('./soa.service', () => ({
  SOAService: class MockSOAService {},
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@/vector-store/lib', () => ({
  syncOrganizationEmbeddings: jest.fn(),
}));

describe('SOAController audit logging', () => {
  const skips = (method: keyof SOAController) =>
    Reflect.getMetadata(SKIP_AUDIT_LOG_KEY, SOAController.prototype[method]) === true;

  it('does not log the idempotent ensure-setup call made on every SoA page load', () => {
    expect(skips('ensureSetup')).toBe(true);
  });

  it('still logs real SoA changes', () => {
    expect(skips('saveAnswer')).toBe(false);
  });
});
