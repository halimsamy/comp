import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const AUDIT_STATUSES = ['planned', 'in_progress', 'awaiting_report', 'completed'] as const;

export class CreateAuditDto {
  @ApiProperty({ description: 'Framework instance being audited', example: 'frm_abc123' })
  @IsString()
  @IsNotEmpty()
  frameworkInstanceId: string;

  @ApiProperty({ description: 'Audit name', example: 'ISO 27001 surveillance audit 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Audit firm (certification body or QSA company)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  firmName?: string;

  @ApiProperty({ description: 'First day of the audit period (YYYY-MM-DD)', example: '2026-01-01' })
  @Matches(DAY, { message: 'periodStart must be YYYY-MM-DD' })
  periodStart: string;

  @ApiProperty({ description: 'Last day of the audit period (YYYY-MM-DD)', example: '2026-12-31' })
  @Matches(DAY, { message: 'periodEnd must be YYYY-MM-DD' })
  periodEnd: string;

  @ApiPropertyOptional({
    description: 'Last day auditors can sign in (YYYY-MM-DD). Auditor-only members are deactivated after it.',
    example: '2027-02-28',
  })
  @IsOptional()
  @Matches(DAY, { message: 'accessEndsAt must be YYYY-MM-DD' })
  accessEndsAt?: string;

  @ApiPropertyOptional({
    description: 'Member ids of the auditors (members with the auditor role)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  auditorMemberIds?: string[];

  @ApiPropertyOptional({
    description:
      'Emails of auditors invited to the organization who have not joined yet; each is assigned to this audit when they first sign in',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  pendingAuditorEmails?: string[];
}

export class UpdateAuditDto {
  @ApiPropertyOptional({ description: 'Audit name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Audit firm', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  firmName?: string | null;

  @ApiPropertyOptional({ enum: AUDIT_STATUSES })
  @IsOptional()
  @IsIn(AUDIT_STATUSES)
  status?: (typeof AUDIT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'First day of the audit period (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DAY, { message: 'periodStart must be YYYY-MM-DD' })
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Last day of the audit period (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DAY, { message: 'periodEnd must be YYYY-MM-DD' })
  periodEnd?: string;

  @ApiPropertyOptional({
    description: 'Last day auditors can sign in (YYYY-MM-DD), or null for no end',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(DAY, { message: 'accessEndsAt must be YYYY-MM-DD' })
  accessEndsAt?: string | null;

  @ApiPropertyOptional({ description: 'Replaces the auditors of the audit', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  auditorMemberIds?: string[];

  @ApiPropertyOptional({
    description:
      'Emails of auditors invited to the organization who have not joined yet; each is assigned to this audit when they first sign in',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  pendingAuditorEmails?: string[];
}
