import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsInt, Min, Max, IsArray, ArrayMaxSize } from 'class-validator';
import { CHECKLIST_AUTO_SOURCES, type ChecklistAutoSource } from '../default-checklist-items';

export class CreateTemplateItemDto {
  @ApiProperty({
    description: 'Checklist item title',
    example: 'Collect access badges',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Guidance text for the admin', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Whether evidence upload is required',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Checklist the item belongs to. Defaults to offboarding.',
    enum: ['onboarding', 'offboarding'],
  })
  @IsOptional()
  @IsIn(['onboarding', 'offboarding'])
  kind?: 'onboarding' | 'offboarding';

  @ApiPropertyOptional({
    description: 'SLA: days after the start date (onboarding) or offboard date the item is due',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  dueDays?: number;

  @ApiPropertyOptional({
    description: 'Complete the item automatically from platform data',
    enum: CHECKLIST_AUTO_SOURCES,
  })
  @IsOptional()
  @IsIn(CHECKLIST_AUTO_SOURCES)
  autoCompleteSource?: ChecklistAutoSource;

  @ApiPropertyOptional({
    description: 'Member roles the item applies to; empty means everyone',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  appliesToRoles?: string[];

  @ApiPropertyOptional({
    description: 'Departments the item applies to; empty means every department',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  appliesToDepartments?: string[];
}
