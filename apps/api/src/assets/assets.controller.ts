import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { authMeta } from '../vendors/tpsp/auth-meta';
import { AssetImportService } from './asset-import.service';
import { markInventoryReviewed, reviewStatus } from './asset-review';
import { AssetSyncService } from './asset-sync.service';
import { AssetsService } from './assets.service';
import {
  CreateAssetDto,
  ImportAssetsDto,
  UpdateAssetDto,
} from './dto/asset.dto';

const ASSET_ID = { name: 'id', description: 'Asset ID', example: 'ast_abc123' };

/** System inventory (ISO 27001 A.5.9, A.8.1; PCI DSS 12.5.1, 12.5.2). */
@ApiTags('Assets')
@Controller({ path: 'assets', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly sync: AssetSyncService,
    private readonly importer: AssetImportService,
  ) {}

  @Get()
  @RequirePermission('integration', 'read')
  @ApiOperation({
    summary: 'List assets',
    description:
      'Returns the system inventory: cloud resources, repositories and devices found by integrations plus manual items, with owner, environment, location, vendor, PCI CDE scope, classification and open vulnerabilities. Also returns the latest inventory review and how many Infrastructure Inventory form rows can be imported.',
  })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  async listAssets(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const [data, review, formImport] = await Promise.all([
      this.assets.list({
        organizationId,
        includeArchived: includeArchived === 'true',
      }),
      reviewStatus(organizationId),
      this.importer.formPreview(organizationId),
    ]);
    return {
      data,
      count: data.length,
      review,
      formImport,
      ...authMeta(authContext),
    };
  }

  @Post()
  @RequirePermission('integration', 'create')
  @ApiOperation({
    summary: 'Add a manual asset',
    description:
      'Adds an asset no integration reports (office network, on-prem server, SaaS app) to the inventory with type, owner, environment, CDE scope and classification.',
  })
  @ApiBody({ type: CreateAssetDto })
  async createAsset(
    @Body() dto: CreateAssetDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const asset = await this.assets.create({
      organizationId,
      dto,
      actor: authContext,
    });
    return { ...asset, ...authMeta(authContext) };
  }

  @Post('import-from-form')
  @RequirePermission('integration', 'create')
  @ApiOperation({
    summary: 'Import the Infrastructure Inventory form',
    description:
      'Turns each row of the latest Infrastructure Inventory submission into an asset: name, description, environment, location, owner (matched by member name or email), vendor (matched by name) and last review date. Re-running updates the same assets.',
  })
  async importFromForm(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.importer.importFromForm(organizationId);
    return { ...result, ...authMeta(authContext) };
  }

  @Post('import')
  @RequirePermission('integration', 'create')
  @ApiOperation({
    summary: 'Import assets from CSV',
    description:
      'Adds or updates manual assets from a CSV with a name column and optional description, type, environment, location, owner, vendor, version, end of support and last reviewed columns. Rows upsert by name.',
  })
  @ApiBody({ type: ImportAssetsDto })
  async importCsv(
    @Body() dto: ImportAssetsDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.importer.importCsv({
      organizationId,
      csv: dto.csv,
    });
    return { ...result, ...authMeta(authContext) };
  }

  @Post('review')
  @RequirePermission('integration', 'update')
  @ApiOperation({
    summary: 'Mark the inventory reviewed',
    description:
      'Records that the signed-in member reviewed every active asset and confirmed PCI DSS scope (12.5.1 inventory review, 12.5.2 annual scope confirmation). Stamps each asset and writes an audit log entry.',
  })
  async markReviewed(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const review = await markInventoryReviewed({
      organizationId,
      actor: authContext,
    });
    return { ...review, ...authMeta(authContext) };
  }

  @Post('sync')
  @RequirePermission('integration', 'update')
  @ApiOperation({
    summary: 'Refresh assets and vulnerabilities',
    description:
      'Rebuilds the asset inventory and integration vulnerabilities from the latest integration check results and enrolled devices. Runs daily on its own; call after a new scan.',
  })
  async syncAssets(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.sync.syncOrganization(organizationId);
    return { ...result, ...authMeta(authContext) };
  }

  @Patch(':id')
  @RequirePermission('integration', 'update')
  @ApiOperation({
    summary: 'Update an asset',
    description:
      'Sets the owner, environment, location, vendor, version, end of support, PCI DSS CDE scope (in scope, connected, out of scope with a justification), data classification or description of an asset. Scope changes are kept in the audit log. Synced assets keep these values across syncs.',
  })
  @ApiParam(ASSET_ID)
  @ApiBody({ type: UpdateAssetDto })
  async updateAsset(
    @Param('id') assetId: string,
    @Body() dto: UpdateAssetDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const asset = await this.assets.update({
      organizationId,
      assetId,
      dto,
      actor: authContext,
    });
    return { ...asset, ...authMeta(authContext) };
  }

  @Delete(':id')
  @RequirePermission('integration', 'delete')
  @ApiOperation({
    summary: 'Delete a manual asset',
    description:
      'Removes a manually added asset from the inventory. Assets found by integrations or devices cannot be deleted; mark them out of scope instead.',
  })
  @ApiParam(ASSET_ID)
  async deleteAsset(
    @Param('id') assetId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.assets.remove({ organizationId, assetId });
    return { ...result, ...authMeta(authContext) };
  }
}
