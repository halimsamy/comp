import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export const NONCONFORMITY_SOURCES = [
  'incident',
  'external_audit',
  'management_review',
  'monitoring',
  'complaint',
  'other',
] as const;
export const NONCONFORMITY_STATUSES = ['open', 'in_progress', 'closed'] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Fields shared by create and update; null clears an optional field. */
class NonconformityFieldsDto {
  @ApiPropertyOptional({ description: 'Reference to where it was raised', example: 'MR-2026-01-A02', nullable: true })
  @IsOptional()
  @IsString()
  sourceRef?: string | null;

  @ApiPropertyOptional({ description: 'Underlying cause (ISO 27001 10.2 b)', nullable: true })
  @IsOptional()
  @IsString()
  rootCause?: string | null;

  @ApiPropertyOptional({ description: 'Action taken to correct it and prevent recurrence (10.2 c)', nullable: true })
  @IsOptional()
  @IsString()
  correctiveAction?: string | null;

  @ApiPropertyOptional({ description: 'Responsible member id', example: 'mem_abc123', nullable: true })
  @IsOptional()
  @IsString()
  ownerMemberId?: string | null;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)', example: '2026-12-31', nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY)
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: NONCONFORMITY_STATUSES, description: 'Tracking status' })
  @IsOptional()
  @IsEnum(NONCONFORMITY_STATUSES)
  status?: (typeof NONCONFORMITY_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Evidence the action was completed', nullable: true })
  @IsOptional()
  @IsString()
  closureEvidence?: string | null;

  @ApiPropertyOptional({ description: 'Date the effectiveness of the action was reviewed (10.2 d)', example: '2027-01-15', nullable: true })
  @IsOptional()
  @Matches(DATE_ONLY)
  effectivenessReviewedAt?: string | null;

  @ApiPropertyOptional({ description: 'Member who reviewed effectiveness', example: 'mem_abc123', nullable: true })
  @IsOptional()
  @IsString()
  effectivenessReviewedById?: string | null;

  @ApiPropertyOptional({ description: 'Outcome of the effectiveness review', nullable: true })
  @IsOptional()
  @IsString()
  effectivenessNotes?: string | null;
}

export class CreateNonconformityDto extends NonconformityFieldsDto {
  @ApiProperty({ enum: NONCONFORMITY_SOURCES, description: 'Where the nonconformity was raised', example: 'incident' })
  @IsEnum(NONCONFORMITY_SOURCES)
  source!: (typeof NONCONFORMITY_SOURCES)[number];

  @ApiProperty({ description: 'What requirement was not fulfilled', example: 'Quarterly access review was skipped in Q2.' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class UpdateNonconformityDto extends PartialType(CreateNonconformityDto) {}
