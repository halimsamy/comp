import { OrganizationId } from '@/auth/auth-context.decorator';
import { HybridAuthGuard } from '@/auth/hybrid-auth.guard';
import { PermissionGuard } from '@/auth/permission.guard';
import { RequirePermission } from '@/auth/require-permission.decorator';
import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBody, ApiExtension, ApiOperation, ApiParam, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsString, ValidateIf } from 'class-validator';
import { evidenceFormTypeSchema } from './evidence-forms.definitions';
import { bulkSetFormOwner, getFormModuleStatus } from './form-settings';

const FORM_TYPES = evidenceFormTypeSchema.options;

export class BulkFormOwnerDto {
  @ApiProperty({ type: 'array', items: { type: 'string', enum: [...FORM_TYPES] }, example: ['penetration-test'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsIn(FORM_TYPES, { each: true })
  formTypes!: (typeof FORM_TYPES)[number][];

  @ApiProperty({ description: 'Member ID of the owner, or null to clear', example: 'mem_abc123', nullable: true, type: String })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerMemberId!: string | null;
}

@ApiTags('Evidence Forms')
@Controller({ path: 'evidence-forms', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class EvidenceFormsSettingsController {
  @Patch('settings/bulk-owner')
  @RequirePermission('evidence', 'update')
  @ApiExtension('x-speakeasy-mcp', { name: 'set-company-forms-owner' })
  @ApiOperation({
    summary: 'Set the owner of several company forms',
    description:
      'Assigns (or clears, with null) the accountable owner of the given company forms. Owners appear on the Documents table and in deadline reminders.',
  })
  @ApiBody({ type: BulkFormOwnerDto })
  async bulkSetOwner(@OrganizationId() organizationId: string, @Body() body: BulkFormOwnerDto) {
    return bulkSetFormOwner({ organizationId, formTypes: body.formTypes, ownerMemberId: body.ownerMemberId });
  }

  @Get(':formType/module-status')
  @RequirePermission('evidence', 'read')
  @ApiExtension('x-speakeasy-mcp', { name: 'get-company-form-module-status' })
  @ApiOperation({
    summary: 'Get where a company form’s evidence now lives',
    description:
      'For a form replaced by a module (Assets, People > Access, ISMS management review), returns that module and its record count. For the penetration test form, also the latest recorded pentest.',
  })
  @ApiParam({ name: 'formType', example: 'infrastructure-inventory' })
  async getModuleStatus(@OrganizationId() organizationId: string, @Param('formType') formType: string) {
    const parsed = evidenceFormTypeSchema.safeParse(formType);
    if (!parsed.success) throw new BadRequestException('Unsupported form type');
    return getFormModuleStatus({ organizationId, formType: parsed.data });
  }
}
