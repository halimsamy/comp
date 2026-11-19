import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AccessRevocationService } from './access-revocation.service';
import { RevokeAccessDto } from './dto/revoke-access.dto';

const SYSTEM_PARAM = {
  name: 'systemKey',
  description:
    "System key from the revocation list ('compai', 'connection:<id>', 'manual:<id>' or 'vendor:<id>'); a bare vendor id is also accepted",
};

/** Offboarding access removal, driven by the access inventory (#82). */
@ApiTags('Offboarding Checklist')
@Controller({ path: 'offboarding-checklist', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AccessRevocationController {
  constructor(private readonly revocations: AccessRevocationService) {}

  private requireUserId(authContext: AuthContextType): string {
    if (!authContext.userId) throw new BadRequestException('User context required');
    return authContext.userId;
  }

  @Get('member/:memberId/access-revocations')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'Get access revocation status for a member',
    description:
      "Lists the systems where a departing member has accounts in the access inventory, with each account's status and whether access was revoked. Systems whose accounts are gone or disabled are marked revoked automatically. Vendors without an account inventory follow as optional rows.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async list(@OrganizationId() organizationId: string, @Param('memberId') memberId: string) {
    return this.revocations.getAccessRevocations(organizationId, memberId);
  }

  @Post('member/:memberId/access-revocations/confirm-all')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Confirm access revoked on every system',
    description:
      "Marks every inventory system of a departing member as revoked in one step, recording who confirmed it. Optional vendor rows are left as they are.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async revokeAll(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    return this.revocations.revokeAll({
      organizationId,
      memberId,
      revokedById: this.requireUserId(authContext),
    });
  }

  @Post('member/:memberId/access-revocations/:systemKey')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Mark access to a system as revoked',
    description:
      "Marks a departing member's access to one system as revoked, with optional notes and a proof file. If the inventory still shows an active account, the row is reported as revoked but still active.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiParam(SYSTEM_PARAM)
  @ApiBody({ type: RevokeAccessDto })
  async revoke(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
    @Param('systemKey') systemKey: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: RevokeAccessDto,
  ) {
    const provided = [body.fileName, body.fileType, body.fileData].filter(Boolean).length;
    if (provided > 0 && provided < 3) {
      throw new BadRequestException('fileName, fileType, and fileData must all be provided together');
    }
    const evidence =
      body.fileName && body.fileType && body.fileData
        ? { fileName: body.fileName, fileType: body.fileType, fileData: body.fileData }
        : undefined;
    return this.revocations.revokeSystemAccess({
      organizationId,
      memberId,
      systemKey,
      revokedById: this.requireUserId(authContext),
      notes: body.notes,
      evidence,
    });
  }

  @Delete('member/:memberId/access-revocations/:systemKey')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Undo an access revocation',
    description: 'Reverses a revocation confirmed by mistake; its proof files are deleted.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiParam(SYSTEM_PARAM)
  async undo(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
    @Param('systemKey') systemKey: string,
  ) {
    return this.revocations.undoRevocation({ organizationId, memberId, systemKey });
  }
}
