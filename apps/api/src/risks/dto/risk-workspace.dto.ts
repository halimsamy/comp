import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Impact,
  Likelihood,
  RiskCategory,
  RiskReviewTrigger,
  TaskItemStatus,
} from '@db';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RiskDraftDto {
  @ApiProperty({ description: 'Risk title', example: 'Cardholder data exposed outside the CDE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @ApiProperty({ description: 'Risk scenario description' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @ApiProperty({ enum: RiskCategory, example: RiskCategory.technology })
  @IsEnum(RiskCategory)
  category: RiskCategory;

  @ApiProperty({ enum: Likelihood, example: Likelihood.possible })
  @IsEnum(Likelihood)
  likelihood: Likelihood;

  @ApiProperty({ enum: Impact, example: Impact.major })
  @IsEnum(Impact)
  impact: Impact;

  @ApiPropertyOptional({ description: 'Suggested mitigation plan' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  treatmentStrategyDescription?: string;
}

export class BulkCreateRisksDto {
  @ApiProperty({ type: [RiskDraftDto], description: 'Risks to add (1-50)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RiskDraftDto)
  risks: RiskDraftDto[];
}

export class CreateRiskReviewDto {
  @ApiPropertyOptional({
    enum: RiskReviewTrigger,
    description:
      'Why the review ran: the planned interval or a significant change (ISO 27001 8.2). Defaults to scheduled.',
    example: RiskReviewTrigger.scheduled,
  })
  @IsOptional()
  @IsEnum(RiskReviewTrigger)
  trigger?: RiskReviewTrigger;

  @ApiPropertyOptional({
    description: 'Review notes: changes found, decisions, follow-ups',
    example: 'Raised payment page skimming to high after the new checkout launch.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Member who signs the review off. Defaults to the caller.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reviewedById?: string;
}

export class ListRiskActionsQueryDto {
  @ApiPropertyOptional({ enum: TaskItemStatus })
  @IsOptional()
  @IsEnum(TaskItemStatus)
  status?: TaskItemStatus;

  @ApiPropertyOptional({ description: 'Filter by owner member ID' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Only open actions past their due date' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
}
