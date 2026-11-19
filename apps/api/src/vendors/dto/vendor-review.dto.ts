import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VendorPciStatus, VendorReviewOutcome } from '@db';

export class VendorReviewChecklistDto {
  @ApiProperty({ description: 'Current SOC 2 / ISO / AOC report reviewed' })
  @IsBoolean()
  assuranceReviewed!: boolean;

  @ApiProperty({
    description: 'PCI DSS compliance status confirmed (PCI DSS 12.8.4)',
  })
  @IsBoolean()
  pciStatusConfirmed!: boolean;

  @ApiProperty({ description: 'Contract and security clauses still valid' })
  @IsBoolean()
  contractReviewed!: boolean;

  @ApiProperty({ description: 'Inherent / residual risk re-assessed' })
  @IsBoolean()
  riskReassessed!: boolean;
}

export class CreateVendorReviewDto {
  @ApiProperty({ enum: VendorReviewOutcome, example: 'approved' })
  @IsEnum(VendorReviewOutcome)
  outcome!: VendorReviewOutcome;

  @ApiProperty({ type: VendorReviewChecklistDto })
  @ValidateNested()
  @Type(() => VendorReviewChecklistDto)
  checklist!: VendorReviewChecklistDto;

  @ApiPropertyOptional({
    enum: VendorPciStatus,
    description:
      'PCI DSS status the reviewer confirmed. Required (and not "unknown") when checklist.pciStatusConfirmed is true (PCI DSS 12.8.4).',
    example: 'compliant',
  })
  @IsOptional()
  @IsEnum(VendorPciStatus)
  pciStatus?: VendorPciStatus;

  @ApiPropertyOptional({
    type: [String],
    description:
      'IDs of the vendor documents (SOC 2, ISO certificate, AOC, ...) the reviewer looked at.',
    example: ['vdoc_abc123'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  reviewedDocumentIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Conditions of an "approved_with_conditions" outcome (at least one required). Each becomes an action on the vendor.',
    example: ['Map CUEC 3 to our quarterly access review'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  conditions?: string[];

  @ApiPropertyOptional({
    description: 'Reviewer notes, conditions or follow-ups',
    example: 'CUECs 3 and 7 mapped to our access review task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Next review date. Defaults to the cadence for the vendor criticality.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  nextReviewDue?: string;
}
