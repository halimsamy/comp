import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VendorReviewOutcome } from '@db';

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
