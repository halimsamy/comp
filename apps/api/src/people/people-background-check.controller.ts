import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AttachmentsService } from '../attachments/attachments.service';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { verifyBackgroundExternally } from './background-check-external';
import { VerifyBackgroundExternallyDto } from './dto/verify-background-externally.dto';

@ApiTags('People')
@Controller({ path: 'people', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PeopleBackgroundCheckController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('background-checks/verified-externally')
  @HttpCode(200)
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Mark background checks verified externally',
    description:
      'Records that the selected members were screened outside Comp AI (provider and date, optional proof file). Members whose check is already complete are skipped.',
  })
  @ApiBody({ type: VerifyBackgroundExternallyDto })
  async verifyExternally(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: VerifyBackgroundExternallyDto,
  ) {
    return verifyBackgroundExternally({
      organizationId,
      userId: authContext.userId,
      dto: body,
      attachments: this.attachments,
    });
  }
}
