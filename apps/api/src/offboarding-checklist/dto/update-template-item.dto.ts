import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, IsIn, Min, Max, ValidateIf } from 'class-validator';
import { CHECKLIST_AUTO_SOURCES, type ChecklistAutoSource } from '../default-checklist-items';

export class UpdateTemplateItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'SLA in days; null removes the due date',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(365)
  dueDays?: number | null;

  @ApiPropertyOptional({
    description: 'Auto-complete source; null makes the item manual',
    enum: CHECKLIST_AUTO_SOURCES,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(CHECKLIST_AUTO_SOURCES)
  autoCompleteSource?: ChecklistAutoSource | null;
}
