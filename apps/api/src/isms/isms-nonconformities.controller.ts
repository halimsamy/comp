import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '@/auth/auth-context.decorator';
import { HybridAuthGuard } from '@/auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { IsmsNonconformityService } from './isms-nonconformity.service';
import {
  CreateNonconformityDto,
  ImportNonconformitiesDto,
  UpdateNonconformityDto,
} from './dto/nonconformity.dto';

/** Nonconformity & corrective action register (ISO 27001 clause 10.2). */
@ApiTags('ISMS')
@Controller({ path: 'isms/nonconformities', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class IsmsNonconformitiesController {
  constructor(private readonly service: IsmsNonconformityService) {}

  @Get()
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'List ISMS nonconformities',
    description:
      'Lists the ISO 27001 10.2 nonconformity register: standalone nonconformities plus major and minor findings from internal audits, with root cause, corrective action and effectiveness review.',
  })
  @ApiOkResponse({ description: 'Nonconformity register rows' })
  async list(@OrganizationId() organizationId: string) {
    return this.service.list({ organizationId });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('evidence', 'update')
  @ApiOperation({
    summary: 'Log an ISMS nonconformity',
    description:
      'Logs a nonconformity raised outside an internal audit (incident, external audit, management review, monitoring, complaint) with its corrective action.',
  })
  @ApiBody({ type: CreateNonconformityDto })
  @ApiOkResponse({ description: 'Created nonconformity' })
  async create(
    @Body() dto: CreateNonconformityDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.service.create({ organizationId, dto });
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('evidence', 'update')
  @ApiOperation({
    summary: 'Import ISMS nonconformities',
    description:
      'Logs the rows of an existing nonconformity log (for example a CSV export from a spreadsheet) in one go, numbered in order.',
  })
  @ApiBody({ type: ImportNonconformitiesDto })
  @ApiOkResponse({ description: 'Number of nonconformities logged' })
  async importMany(
    @Body() dto: ImportNonconformitiesDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.service.importMany({ organizationId, rows: dto.rows });
  }

  @Patch(':id')
  @RequirePermission('evidence', 'update')
  @ApiOperation({
    summary: 'Update an ISMS nonconformity',
    description:
      'Updates a standalone nonconformity: root cause, corrective action, owner, due date, status, closure evidence or effectiveness review.',
  })
  @ApiBody({ type: UpdateNonconformityDto })
  @ApiOkResponse({ description: 'Updated nonconformity' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateNonconformityDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.service.update({ id, organizationId, dto });
  }

  @Delete(':id')
  @RequirePermission('evidence', 'update')
  @ApiOperation({
    summary: 'Delete an ISMS nonconformity',
    description:
      'Deletes a standalone nonconformity from the ISO 27001 clause 10.2 register. Internal audit findings are removed from their audit instead.',
  })
  @ApiOkResponse({ description: 'Deleted' })
  async remove(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.service.remove({ id, organizationId });
  }
}
