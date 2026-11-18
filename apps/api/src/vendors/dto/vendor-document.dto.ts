import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VendorDocumentType } from '@db';
import { UploadAttachmentDto } from '../../attachments/upload-attachment.dto';

export class CreateVendorDocumentDto extends UploadAttachmentDto {
  @ApiProperty({ enum: VendorDocumentType, example: 'soc2_type2' })
  @IsEnum(VendorDocumentType)
  type!: VendorDocumentType;

  @ApiPropertyOptional({
    description: 'Display name (defaults to the file name)',
    example: 'Stripe SOC 2 Type II 2026',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Start of the audit / coverage period',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({
    description: 'End of the audit / coverage period',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({
    description:
      'When the document stops being valid. Defaults to 12 months after periodEnd for assurance reports.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateVendorDocumentDto {
  @ApiPropertyOptional({ enum: VendorDocumentType })
  @IsOptional()
  @IsEnum(VendorDocumentType)
  type?: VendorDocumentType;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  periodStart?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
