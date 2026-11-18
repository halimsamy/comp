import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { AssetSyncService } from './asset-sync.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';

jest.mock('@db', () => ({ ...jest.requireActual('@prisma/client'), db: {} }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: { integration: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

const ORG = 'org_1';
const authContext: AuthContext = {
  organizationId: ORG,
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  userEmail: 'a@x.com',
  memberId: 'mem_1',
};
const permissionsOf = (handler: unknown) =>
  Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
const perm = (action: string) => [
  { resource: 'integration', actions: [action] },
];

describe('assets and vulnerabilities controllers', () => {
  let assetsController: AssetsController;
  let vulnsController: VulnerabilitiesController;
  const assets = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const sync = { syncOrganization: jest.fn() };
  const vulns = { list: jest.fn(), create: jest.fn(), update: jest.fn() };
  const importer = { import: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController, VulnerabilitiesController],
      providers: [
        { provide: AssetsService, useValue: assets },
        { provide: AssetSyncService, useValue: sync },
        { provide: VulnerabilitiesService, useValue: vulns },
        { provide: VulnerabilityImportService, useValue: importer },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    assetsController = module.get(AssetsController);
    vulnsController = module.get(VulnerabilitiesController);
  });

  it('gates reads with integration:read and every mutation with a write action', () => {
    const a = AssetsController.prototype;
    const v = VulnerabilitiesController.prototype;
    expect(permissionsOf(a.listAssets)).toEqual(perm('read'));
    expect(permissionsOf(a.createAsset)).toEqual(perm('create'));
    expect(permissionsOf(a.syncAssets)).toEqual(perm('update'));
    expect(permissionsOf(a.updateAsset)).toEqual(perm('update'));
    expect(permissionsOf(a.deleteAsset)).toEqual(perm('delete'));
    expect(permissionsOf(v.listVulnerabilities)).toEqual(perm('read'));
    expect(permissionsOf(v.createVulnerability)).toEqual(perm('create'));
    expect(permissionsOf(v.importVulnerabilities)).toEqual(perm('create'));
    expect(permissionsOf(v.updateVulnerability)).toEqual(perm('update'));
  });

  it('lists assets for the caller organization in the list envelope', async () => {
    assets.list.mockResolvedValue([{ id: 'ast_1' }]);
    const res = await assetsController.listAssets(ORG, authContext, 'true');
    expect(assets.list).toHaveBeenCalledWith({
      organizationId: ORG,
      includeArchived: true,
    });
    expect(res).toMatchObject({
      data: [{ id: 'ast_1' }],
      count: 1,
      authType: 'session',
    });
  });

  it('passes mutations through with the organization id', async () => {
    assets.update.mockResolvedValue({ id: 'ast_1' });
    await assetsController.updateAsset(
      'ast_1',
      { cdeScope: 'in_scope' },
      ORG,
      authContext,
    );
    expect(assets.update).toHaveBeenCalledWith({
      organizationId: ORG,
      assetId: 'ast_1',
      dto: { cdeScope: 'in_scope' },
    });

    sync.syncOrganization.mockResolvedValue({ assets: 1, vulnerabilities: 0 });
    await expect(
      assetsController.syncAssets(ORG, authContext),
    ).resolves.toMatchObject({ assets: 1 });

    importer.import.mockResolvedValue({ created: 1 });
    await vulnsController.importVulnerabilities(
      { source: 'asv_scan', csv: 'a' },
      ORG,
      authContext,
    );
    expect(importer.import).toHaveBeenCalledWith({
      organizationId: ORG,
      source: 'asv_scan',
      csv: 'a',
      resolveMissing: false,
    });

    vulns.update.mockResolvedValue({ id: 'ipf_1' });
    await vulnsController.updateVulnerability(
      'ipf_1',
      { status: 'open' },
      ORG,
      authContext,
    );
    expect(vulns.update).toHaveBeenCalledWith({
      organizationId: ORG,
      vulnerabilityId: 'ipf_1',
      dto: { status: 'open' },
    });
  });
});
