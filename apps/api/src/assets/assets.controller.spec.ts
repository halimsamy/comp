import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { AssetImportService } from './asset-import.service';
import { AssetSyncService } from './asset-sync.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';
import { VulnerabilityProgramController } from './vulnerability-program.controller';
import { VulnerabilityProgramService } from './vulnerability-program.service';

jest.mock('./asset-review', () => ({
  reviewStatus: jest
    .fn()
    .mockResolvedValue({ lastReviewedAt: null, reviewedBy: null }),
  markInventoryReviewed: jest.fn().mockResolvedValue({ lastReviewedAt: 'now' }),
}));

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
  let programController: VulnerabilityProgramController;
  const assets = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const sync = { syncOrganization: jest.fn() };
  const vulns = { list: jest.fn(), create: jest.fn(), update: jest.fn() };
  const importer = { import: jest.fn() };
  const assetImporter = {
    formPreview: jest.fn(),
    importFromForm: jest.fn(),
    importCsv: jest.fn(),
  };
  const program = {
    scans: jest.fn(),
    fileUrl: jest.fn(),
    slaPolicy: jest.fn(),
    saveSlaPolicy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        AssetsController,
        VulnerabilitiesController,
        VulnerabilityProgramController,
      ],
      providers: [
        { provide: AssetsService, useValue: assets },
        { provide: AssetSyncService, useValue: sync },
        { provide: VulnerabilitiesService, useValue: vulns },
        { provide: VulnerabilityImportService, useValue: importer },
        { provide: AssetImportService, useValue: assetImporter },
        { provide: VulnerabilityProgramService, useValue: program },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    assetsController = module.get(AssetsController);
    vulnsController = module.get(VulnerabilitiesController);
    programController = module.get(VulnerabilityProgramController);
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
    expect(permissionsOf(a.importFromForm)).toEqual(perm('create'));
    expect(permissionsOf(a.importCsv)).toEqual(perm('create'));
    expect(permissionsOf(a.markReviewed)).toEqual(perm('update'));
    const p = VulnerabilityProgramController.prototype;
    expect(permissionsOf(p.listScans)).toEqual(perm('read'));
    expect(permissionsOf(p.downloadFile)).toEqual(perm('read'));
    expect(permissionsOf(p.getSlaPolicy)).toEqual(perm('read'));
    expect(permissionsOf(p.updateSlaPolicy)).toEqual(perm('update'));
  });

  it('runs imports, the review and SLA policy saves for the caller organization', async () => {
    assetImporter.importFromForm.mockResolvedValue({ created: 33 });
    await expect(
      assetsController.importFromForm(ORG, authContext),
    ).resolves.toMatchObject({ created: 33, authType: 'session' });
    expect(assetImporter.importFromForm).toHaveBeenCalledWith(ORG);

    assetImporter.importCsv.mockResolvedValue({ created: 1 });
    await assetsController.importCsv({ csv: 'name\nx' }, ORG, authContext);
    expect(assetImporter.importCsv).toHaveBeenCalledWith({
      organizationId: ORG,
      csv: 'name\nx',
    });

    await assetsController.markReviewed(ORG, authContext);
    const { markInventoryReviewed } = jest.requireMock('./asset-review');
    expect(markInventoryReviewed).toHaveBeenCalledWith({
      organizationId: ORG,
      actor: authContext,
    });

    const dto = {
      criticalDays: 14,
      highDays: 30,
      mediumDays: 90,
      lowDays: 180,
    };
    program.saveSlaPolicy.mockResolvedValue(dto);
    await programController.updateSlaPolicy(dto, ORG, authContext);
    expect(program.saveSlaPolicy).toHaveBeenCalledWith({
      organizationId: ORG,
      dto,
      userId: 'usr_1',
      memberId: 'mem_1',
    });

    program.scans.mockResolvedValue({ data: [], cadence: [], uncovered: [] });
    await expect(
      programController.listScans(ORG, authContext),
    ).resolves.toMatchObject({ data: [], count: 0 });
  });

  it('lists assets for the caller organization in the list envelope', async () => {
    assets.list.mockResolvedValue([{ id: 'ast_1' }]);
    assetImporter.formPreview.mockResolvedValue({ rows: 33, imported: 0 });
    const res = await assetsController.listAssets(ORG, authContext, 'true');
    expect(assets.list).toHaveBeenCalledWith({
      organizationId: ORG,
      includeArchived: true,
    });
    expect(res).toMatchObject({
      data: [{ id: 'ast_1' }],
      count: 1,
      formImport: { rows: 33, imported: 0 },
      review: { lastReviewedAt: null },
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
      actor: authContext,
    });

    sync.syncOrganization.mockResolvedValue({ assets: 1, vulnerabilities: 0 });
    await expect(
      assetsController.syncAssets(ORG, authContext),
    ).resolves.toMatchObject({ assets: 1 });

    importer.import.mockResolvedValue({ created: 1 });
    await vulnsController.importVulnerabilities(
      {
        source: 'asv_scan',
        csv: 'a',
        scannedAt: '2026-10-01',
        vendor: 'Qualys',
      },
      ORG,
      authContext,
    );
    expect(importer.import).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        userId: 'usr_1',
        source: 'asv_scan',
        csv: 'a',
        resolveMissing: false,
        scannedAt: new Date('2026-10-01T00:00:00Z'),
        vendor: 'Qualys',
      }),
    );

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
      actor: authContext,
    });
  });
});
