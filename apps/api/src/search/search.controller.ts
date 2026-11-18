import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller({ path: 'search', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('index')
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get the search index',
    description:
      'Lists requirements, controls, policies, evidence tasks, risks, vendors, people and ISMS documents the caller may open, as lightweight entries for quick search.',
  })
  async getIndex(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const data = await this.searchService.buildIndex({
      organizationId,
      authContext,
    });
    return { data, count: data.length };
  }
}
