import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccessReviewDecision } from '@db';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AccessReviewSystemInputDto {
  @ApiProperty({
    description: 'System key from GET /v1/access/systems',
    example: 'compai',
  })
  @Matches(/^(compai|connection:[\w-]+|manual:[\w-]+)$/)
  systemKey: string;

  @ApiPropertyOptional({ description: 'Member who reviews this system' })
  @IsOptional()
  @IsString()
  reviewerMemberId?: string;
}

export class CreateAccessReviewDto {
  @ApiProperty({
    description: 'Review name',
    example: 'H2 2026 user access review',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Due date (ISO date)', example: '2026-12-31' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({
    type: [AccessReviewSystemInputDto],
    description: 'Systems in scope',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AccessReviewSystemInputDto)
  systems: AccessReviewSystemInputDto[];
}

export class DecideAccessReviewItemsDto {
  @ApiProperty({ type: [String], description: 'Review item ids' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  itemIds: string[];

  @ApiProperty({
    enum: AccessReviewDecision,
    example: AccessReviewDecision.keep,
  })
  @IsEnum(AccessReviewDecision)
  decision: AccessReviewDecision;

  @ApiPropertyOptional({
    description: 'Reviewer note; required when modifying access',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RemediateAccessReviewItemDto {
  @ApiPropertyOptional({ description: 'What was done, e.g. a ticket link' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SignOffAccessReviewDto {
  @ApiPropertyOptional({ description: 'Sign-off note' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
