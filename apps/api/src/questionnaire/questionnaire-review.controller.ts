import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { authMeta } from '../vendors/tpsp/auth-meta';
import { ExternalQuestionnaireReviewService } from './external-review.service';

@ApiTags('Questionnaire')
@Controller({ path: 'questionnaire', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class QuestionnaireReviewController {
  constructor(private readonly review: ExternalQuestionnaireReviewService) {}

  @Post(':id/approve-external')
  @RequirePermission('questionnaire', 'update')
  @ApiOperation({
    summary: 'Approve trust portal questionnaire answers',
    description:
      'Approves the reviewed answers to a questionnaire a trust portal visitor uploaded and emails them (PDF, CSV, XLSX) to the requester. Only for questionnaires waiting for review.',
  })
  @ApiParam({ name: 'id', description: 'Questionnaire ID', example: 'qst_abc123' })
  async approveExternalQuestionnaire(
    @Param('id') questionnaireId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.review.approve({
      organizationId,
      questionnaireId,
      userId: authContext.userId,
    });
    return { ...result, ...authMeta(authContext) };
  }
}
