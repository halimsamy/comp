import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RecordTrainingDto {
  @ApiProperty({
    description: "'general' (security awareness), 'hipaa', or a training module id or title",
    example: 'general',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  module: string;

  @ApiProperty({ description: 'When the training was taken (ISO date, not in the future)', example: '2026-03-01' })
  @IsDateString()
  completedAt: string;

  @ApiPropertyOptional({ description: 'Certificate or sign-in sheet file name (with fileType and fileData)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ description: 'File MIME type' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fileType?: string;

  @ApiPropertyOptional({ description: 'File content, base64' })
  @IsOptional()
  @IsString()
  fileData?: string;
}

export class ImportTrainingRowDto {
  @ApiProperty({ description: 'Member email', example: 'jane@acme.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  email: string;

  @ApiProperty({ description: "'Security awareness', 'HIPAA', or a module title", example: 'Security awareness' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  module: string;

  @ApiProperty({ description: 'Completion date (ISO)', example: '2026-03-01' })
  @IsDateString()
  completedAt: string;
}

export class ImportTrainingRecordsDto {
  @ApiProperty({ type: [ImportTrainingRowDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportTrainingRowDto)
  rows: ImportTrainingRowDto[];
}

export class MyCertificateDto {
  @ApiPropertyOptional({
    description: "'general' (default), 'hipaa-sat-1' or a training module id",
    example: 'general',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  moduleId?: string;
}
