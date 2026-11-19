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
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

  @ApiPropertyOptional({
    description:
      'Why the asset is out of PCI DSS scope; required when cdeScope is out_of_scope',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scopeJustification?: string | null;

  @ApiPropertyOptional({
    description: 'Where it runs (region, data centre, SaaS)',
    example: 'AWS eu-central-1',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @ApiPropertyOptional({
    description: 'Hosting or supplying vendor id',
    example: 'vnd_abc123',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  vendorId?: string | null;

  @ApiPropertyOptional({ description: 'Software / OS version', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  version?: string | null;

  @ApiPropertyOptional({
    description: 'Vendor end of support date (YYYY-MM-DD)',
    example: '2027-06-30',
    nullable: true,
  })
  @IsOptional()
  @Matches(DATE_ONLY)
  endOfSupportAt?: string | null;
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

export class ImportAssetsDto {
  @ApiProperty({
    description:
      'CSV text with a header row. Recognised columns: name/asset/system (required), description, type, environment, location/region, owner (name or email), vendor/provider, version, end of support, last reviewed.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5_000_000)
  csv!: string;
}
