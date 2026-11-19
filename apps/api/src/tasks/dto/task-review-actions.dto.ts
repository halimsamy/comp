import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class BulkTaskDueDateDto {
  @ApiProperty({ type: 'array', items: { type: 'string' }, example: ['tsk_abc123'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  taskIds!: string[];

  @ApiProperty({
    description: 'Due date (YYYY-MM-DD), or null to clear it',
    example: '2026-12-31',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @Matches(DAY, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate!: string | null;
}

export class TaskAttachmentsValidityDto {
  @ApiPropertyOptional({
    description: 'First day the files are valid (YYYY-MM-DD); omitted keeps each file’s own start',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(DAY, { message: 'validFrom must be YYYY-MM-DD' })
  validFrom?: string;

  @ApiProperty({
    description: 'Last day the files are valid (YYYY-MM-DD), or null for no end date',
    example: '2026-12-31',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null)
  @Matches(DAY, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil!: string | null;
}
