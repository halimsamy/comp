import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class VerifyBackgroundExternallyDto {
  @ApiProperty({ type: [String], description: 'Members whose background was screened outside Comp AI' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  memberIds: string[];

  @ApiProperty({ description: 'Who screened them (agency, HR provider)', example: 'Sterling' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  provider: string;

  @ApiProperty({ description: 'When the screening was completed (ISO date, not in the future)', example: '2026-03-01' })
  @IsDateString()
  verifiedAt: string;

  @ApiPropertyOptional({ description: 'Proof file name (with fileType and fileData), attached to every member' })
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
