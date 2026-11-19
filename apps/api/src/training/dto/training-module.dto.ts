import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTrainingModuleDto {
  @ApiProperty({ description: 'Training title', example: 'Secure coding for developers' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'What the training covers' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Link to the course, video or slides',
    example: 'https://owasp.org/www-project-top-ten/',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  contentUrl?: string;

  @ApiPropertyOptional({
    description: 'Framework requirement this training satisfies',
    example: 'PCI DSS 6.2.2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  frameworkReference?: string;

  @ApiPropertyOptional({
    description: 'Member roles that must take it. Empty means everyone.',
    type: 'array',
    items: { type: 'string' },
    example: ['employee'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({
    description:
      'Departments that must take it, built-in (e.g. "it") or custom, matched against the member department. Empty means every department.',
    type: [String],
    example: ['it'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  targetDepartments?: string[];

  @ApiPropertyOptional({
    description: 'Months a completion stays valid before the member must retake it',
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  recurrenceMonths?: number;
}

export class UpdateTrainingModuleDto extends PartialType(CreateTrainingModuleDto) {
  @ApiPropertyOptional({ description: 'Whether the module is assigned to members' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class CompleteTrainingModuleDto {
  @ApiPropertyOptional({
    description: 'When the training was taken (ISO date). Defaults to now.',
    example: '2026-03-01',
  })
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class TrainingCycleCertificateDto {
  @ApiProperty({
    description: "Cycle module: 'general', 'hipaa-sat-1' or a training module ID",
    example: 'general',
  })
  @IsString()
  @IsNotEmpty()
  moduleId!: string;

  @ApiProperty({
    description: 'Completion timestamp of the cycle, as returned by the cycles endpoint',
    example: '2026-03-01T10:00:00.000Z',
  })
  @IsDateString()
  completedAt!: string;
}
