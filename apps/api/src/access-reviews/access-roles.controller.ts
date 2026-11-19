import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AccessAccountsService } from './access-accounts.service';
import { listPrivilegedAccounts } from './access-exports';
import { applyRbacImport, previewRbacImport } from './access-rbac-import';
import { AccessRolesService } from './access-roles.service';
import {
  AccessRolesQueryDto,
  AllowedAccountTypesDto,
  CreateAccessRoleDto,
  ImportRbacMatrixDto,
  UpdateAccessRoleDto,
} from './dto/access-roles.dto';

/** Approved roles per system, allowed account types and privileged users (PCI DSS 7.2.1, 7.2.2, 8.2.2). */
@ApiTags('Access')
@Controller({ path: 'access', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AccessRolesController {
  constructor(
    private readonly roles: AccessRolesService,
    private readonly accounts: AccessAccountsService,
  ) {}

  @Get('roles')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'List approved roles',
    description:
      'Returns the approved roles of every system (or one system) with permission scope, privileged flag, approver and last review. Accounts holding other roles are flagged in access reviews.',
  })
  async list(@OrganizationId() organizationId: string, @Query() query: AccessRolesQueryDto) {
    const data = await this.roles.list({ organizationId, systemKey: query.system });
    return { data, count: data.length };
  }

  @Post('roles')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Add an approved role',
    description: 'Adds a role to a system’s approved role catalog, approved by the caller unless another approver is given.',
  })
  @ApiBody({ type: CreateAccessRoleDto })
  async create(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: CreateAccessRoleDto,
  ) {
    return this.roles.create({ organizationId, callerMemberId: authContext.memberId, dto: body });
  }

  @Patch('roles/:id')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Update an approved role',
    description: 'Changes a role’s name, scope, privileged flag or approver, and stamps it as reviewed today.',
  })
  @ApiParam({ name: 'id', description: 'Role id' })
  @ApiBody({ type: UpdateAccessRoleDto })
  async update(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdateAccessRoleDto,
  ) {
    return this.roles.update({ organizationId, id, dto: body });
  }

  @Delete('roles/:id')
  @RequirePermission('member', 'update')
  @ApiOperation({ summary: 'Delete an approved role', description: 'Removes a role from a system’s approved catalog.' })
  @ApiParam({ name: 'id', description: 'Role id' })
  async remove(@OrganizationId() organizationId: string, @Param('id') id: string) {
    return this.roles.remove({ organizationId, id });
  }

  @Put('systems/:id/allowed-types')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Set allowed account types of a manual system',
    description:
      'Records whether human, service and shared accounts are allowed on the system, with a justification. Accounts of a disallowed type are flagged.',
  })
  @ApiParam({ name: 'id', description: 'Manual system id' })
  @ApiBody({ type: AllowedAccountTypesDto })
  async setAllowedTypes(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() body: AllowedAccountTypesDto,
  ) {
    return this.roles.setAllowedTypes({ organizationId, systemId: id, dto: body });
  }

  @Post('import-from-rbac-matrix')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Import the RBAC matrix form into systems and roles',
    description:
      'Without groups, returns the proposed systems (form system names merged when they differ only in case or a "(...)" suffix). With confirmed groups, creates manual systems and their approved roles, mapping "approved by" to a member. Safe to run again.',
  })
  @ApiBody({ type: ImportRbacMatrixDto })
  async importRbacMatrix(@OrganizationId() organizationId: string, @Body() body: ImportRbacMatrixDto) {
    if (!body.groups) return { preview: await previewRbacImport(organizationId) };
    return applyRbacImport({ organizationId, groups: body.groups });
  }

  @Get('privileged-accounts')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'List privileged accounts',
    description: 'Returns every active admin account across all systems with owner, roles, MFA and last login (PCI DSS 7.2.2, 8.4.1).',
  })
  async privileged(@OrganizationId() organizationId: string) {
    const data = await listPrivilegedAccounts(organizationId, this.accounts);
    return { data, count: data.length };
  }
}
