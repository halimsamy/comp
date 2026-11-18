import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  AssetCdeScope,
  AssetDataClassification,
  AssetEnvironment,
  AssetType,
} from '@db';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Attributes people set on an asset; null clears an optional field. */
class AssetAttributesDto {
  @ApiPropertyOptional({ enum: AssetEnvironment, example: 'production' })
  @IsOptional()
  @IsEnum(AssetEnvironment)
  environment?: AssetEnvironment;

  @ApiPropertyOptional({
    enum: AssetCdeScope,
    description:
      'PCI DSS 12.5.2 scope: in_scope (stores, processes or transmits CHD), connected (can affect the CDE) or out_of_scope',
    example: 'in_scope',
  })
  @IsOptional()
  @IsEnum(AssetCdeScope)
  cdeScope?: AssetCdeScope;

  @ApiPropertyOptional({
    enum: AssetDataClassification,
    example: 'confidential',
  })
  @IsOptional()
  @IsEnum(AssetDataClassification)
  dataClassification?: AssetDataClassification;

  @ApiPropertyOptional({
    description: 'Owner member id',
    example: 'mem_abc123',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiPropertyOptional({
    description: 'Function / purpose of the asset',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class CreateAssetDto extends AssetAttributesDto {
  @ApiProperty({ description: 'Asset name', example: 'Office firewall' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: AssetType, example: 'network' })
  @IsEnum(AssetType)
  type!: AssetType;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
