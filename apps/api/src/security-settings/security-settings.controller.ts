import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type {
  AuthContext as AuthContextType,
  AuthenticatedRequest,
} from '../auth/types';
import { authMeta } from '../vendors/tpsp/auth-meta';
import { UpdateSecuritySettingsDto } from './dto/update-security-settings.dto';
import { SecuritySettingsService } from './security-settings.service';

/** Org security settings: idle session timeout (PCI DSS 8.2.8, ISO 27001 A.8.5) and allowed sign-in methods. */
@ApiTags('Security Settings')
@Controller({ path: 'security-settings', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class SecuritySettingsController {
  constructor(private readonly service: SecuritySettingsService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'Get security settings',
    description:
      'Returns the organization idle session timeout and allowed sign-in methods, plus the options this deployment supports. Use to review PCI DSS 8.2.8 session controls.',
  })
  async getSecuritySettings(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const settings = await this.service.get(organizationId);
    return { ...settings, ...authMeta(authContext) };
  }

  @Get('session-policy')
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get session policy',
    description:
      'Returns the idle session timeout (minutes, or null when off) that apps use to sign out inactive users.',
  })
  async getSessionPolicy(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const policy = await this.service.getSessionPolicy(organizationId);
    return { ...policy, ...authMeta(authContext) };
  }

  @Patch()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Update security settings',
    description:
      'Sets the idle session timeout (15 minutes meets PCI DSS 8.2.8) and which sign-in methods members may use. Refuses changes that would lock out the caller.',
  })
  @ApiBody({ type: UpdateSecuritySettingsDto })
  async updateSecuritySettings(
    @Body() dto: UpdateSecuritySettingsDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Req() req: AuthenticatedRequest,
  ) {
    const settings = await this.service.update({
      organizationId,
      sessionId: req.sessionId,
      dto,
    });
    return { ...settings, ...authMeta(authContext) };
  }
}
