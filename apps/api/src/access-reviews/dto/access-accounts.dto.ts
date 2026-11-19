import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const SYSTEM_KEY = /^(compai|connection:[\w-]+|manual:[\w-]+)$/;

export class SystemAccountsQueryDto {
  @ApiPropertyOptional({
    description:
      "System key: 'compai', 'connection:<connectionId>' or 'manual:<systemId>'. Required unless member is given.",
    example: 'compai',
  })
  @ValidateIf((o: SystemAccountsQueryDto) => !o.member)
  @Matches(SYSTEM_KEY)
  system?: string;

  @ApiPropertyOptional({
    description: "Member id: returns that member's accounts across every system",
  })
  @IsOptional()
  @IsString()
  member?: string;
}

export class CreateAccessSystemDto {
  @ApiProperty({ description: 'System name', example: 'Bank portal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'What the system is used for' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ImportAccountDto {
  @ApiProperty({
    description: 'Username, email or account id',
    example: 'jane@acme.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  accountId: string;

  @ApiPropertyOptional({ description: 'Display name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Email used to match the account to a member',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ enum: ['human', 'service', 'shared'] })
  @IsOptional()
  @IsIn(['human', 'service', 'shared'])
  type?: 'human' | 'service' | 'shared';

  @ApiPropertyOptional({
    description: 'Owner email or member name (maps the account to a member)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  owner?: string;

  @ApiPropertyOptional({
    description: 'Why a service or shared account exists',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  justification?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'deactivated'] })
  @IsOptional()
  @IsIn(['active', 'suspended', 'deactivated'])
  status?: 'active' | 'suspended' | 'deactivated';

  @ApiPropertyOptional({
    type: [String],
    description: 'Roles, groups or permissions',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  roles?: string[];

  @ApiPropertyOptional({ description: 'Has administrator privileges' })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({ description: 'MFA enabled on the account' })
  @IsOptional()
  @IsBoolean()
  mfaEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Last login (ISO date)' })
  @IsOptional()
  @IsString()
  lastLoginAt?: string;

  @ApiPropertyOptional({ description: 'Account creation date (ISO date)' })
  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class ImportAccountsDto {
  @ApiProperty({
    type: [ImportAccountDto],
    description: 'The full account list (replaces the current one)',
  })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportAccountDto)
  accounts: ImportAccountDto[];
}

export class SetAccountOwnerDto {
  @ApiProperty({ description: 'System key', example: 'connection:icn_abc' })
  @Matches(SYSTEM_KEY)
  systemKey: string;

  @ApiProperty({
    description: 'Account id within the system',
    example: 'acme/octocat',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  accountId: string;

  @ApiPropertyOptional({
    description: 'Owning member id; null clears the mapping',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  memberId?: string | null;

  @ApiPropertyOptional({ description: 'Mark as a service (non-human) account' })
  @IsOptional()
  @IsBoolean()
  isServiceAccount?: boolean;

  @ApiPropertyOptional({
    description: 'Why a service account exists (required for service accounts)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  justification?: string;
}
