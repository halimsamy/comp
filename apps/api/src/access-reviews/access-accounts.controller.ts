import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AccessAccountsService } from './access-accounts.service';
import { AccessSystemsService } from './access-systems.service';
import {
  CreateAccessSystemDto,
  ImportAccountsDto,
  SetAccountOwnerDto,
  SystemAccountsQueryDto,
} from './dto/access-accounts.dto';

/** Account inventory per system: Comp AI, connected integrations and manual systems. */
@ApiTags('Access')
@Controller({ path: 'access', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AccessAccountsController {
  constructor(
    private readonly accounts: AccessAccountsService,
    private readonly systems: AccessSystemsService,
  ) {}

  @Get('systems')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'List systems with user accounts',
    description:
      'Returns every system whose accounts can be reviewed (Comp AI, connected identity and code integrations, manual systems) with account and flagged counts.',
  })
  async listSystems(@OrganizationId() organizationId: string) {
    return { data: await this.accounts.listSystems(organizationId) };
  }

  @Get('accounts')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'List the accounts of one system or one member',
    description:
      "Returns the accounts of a system (or, with member, one person's accounts across every system) with owner, roles, MFA, last login and flags (owner left, no owner, admin, no MFA, inactive or never used for 90+ days, unapproved role, account type not allowed). Use for access inventory evidence.",
  })
  async listAccounts(
    @OrganizationId() organizationId: string,
    @Query() query: SystemAccountsQueryDto,
  ) {
    if (query.member) {
      const data = await this.accounts.listMemberAccounts({
        organizationId,
        memberId: query.member,
      });
      return { data, count: data.length };
    }
    const result = await this.accounts.getSystemAccounts({
      organizationId,
      systemKey: query.system ?? '',
    });
    return {
      system: result.system,
      data: result.accounts,
      count: result.accounts.length,
    };
  }

  @Put('owners')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Set the owner of an account',
    description:
      'Maps an account to a member, marks it a service account with a justification, or clears the mapping. Use for accounts email matching cannot place.',
  })
  @ApiBody({ type: SetAccountOwnerDto })
  async setOwner(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: SetAccountOwnerDto,
  ) {
    return this.systems.setOwner({
      organizationId,
      callerMemberId: authContext.memberId,
      ...body,
    });
  }

  @Post('systems')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Add a manual system',
    description:
      'Creates a system without an integration, such as a bank portal, whose accounts are imported from a CSV export.',
  })
  @ApiBody({ type: CreateAccessSystemDto })
  async createSystem(
    @OrganizationId() organizationId: string,
    @Body() body: CreateAccessSystemDto,
  ) {
    return this.systems.create({ organizationId, ...body });
  }

  @Post('systems/:id/accounts')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Import the accounts of a manual system',
    description:
      'Replaces the account list of a manual system with the given rows (from a CSV export). Accounts are matched to members by email.',
  })
  @ApiParam({ name: 'id', description: 'Manual system id' })
  @ApiBody({ type: ImportAccountsDto })
  async importAccounts(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Body() body: ImportAccountsDto,
  ) {
    return this.systems.importAccounts({
      organizationId,
      id,
      accounts: body.accounts,
    });
  }

  @Delete('systems/:id')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Delete a manual system',
    description:
      'Deletes a manual system, its imported accounts and owner mappings. Completed access reviews keep their snapshot.',
  })
  @ApiParam({ name: 'id', description: 'Manual system id' })
  async deleteSystem(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.systems.remove({ organizationId, id });
  }
}
