import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { VendorTpspFieldsDto } from './vendor-tpsp-fields.dto';

/** One vendor's changes in a bulk update: TPSP fields plus the owner. */
export class BulkVendorUpdateItemDto extends VendorTpspFieldsDto {
  @ApiProperty({ description: 'Vendor ID', example: 'vnd_abc123' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({
    description: 'Owner (member ID); null clears it',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class BulkUpdateVendorsDto {
  @ApiProperty({
    type: [BulkVendorUpdateItemDto],
    description: 'Per-vendor changes (1-500). Fields left out are unchanged.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkVendorUpdateItemDto)
  updates!: BulkVendorUpdateItemDto[];
}

export class ArchiveVendorDto {
  @ApiPropertyOptional({
    description: 'Why the relationship ended',
    example: 'Contract ended; data deletion confirmed on 2026-11-01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
