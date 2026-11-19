import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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

export class AccessRolesQueryDto {
  @ApiPropertyOptional({ description: 'Only roles of this system key', example: 'compai' })
  @IsOptional()
  @Matches(SYSTEM_KEY)
  system?: string;
}

export class CreateAccessRoleDto {
  @ApiProperty({ description: 'System key', example: 'manual:asy_abc' })
  @Matches(SYSTEM_KEY)
  systemKey: string;

  @ApiProperty({ description: 'System name shown in exports', example: 'Bank portal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  systemName: string;

  @ApiProperty({ description: 'Role, group or permission set name', example: 'Finance approver' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'What the role can do (least privilege scope)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  permissionsScope?: string;

  @ApiPropertyOptional({ description: 'Administrative / privileged role' })
  @IsOptional()
  @IsBoolean()
  isPrivileged?: boolean;

  @ApiPropertyOptional({ description: 'Member who approved the role; defaults to the caller' })
  @IsOptional()
  @IsString()
  approvedById?: string;
}

export class UpdateAccessRoleDto {
  @ApiPropertyOptional({ description: 'Role name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'What the role can do', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  permissionsScope?: string | null;

  @ApiPropertyOptional({ description: 'Administrative / privileged role' })
  @IsOptional()
  @IsBoolean()
  isPrivileged?: boolean;

  @ApiPropertyOptional({ description: 'Approving member; null clears the approval', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  approvedById?: string | null;
}

export class AllowedAccountTypeDto {
  @ApiProperty({ enum: ['human', 'service', 'shared'] })
  @IsIn(['human', 'service', 'shared'])
  type: 'human' | 'service' | 'shared';

  @ApiProperty({ description: 'Whether this account type is allowed on the system' })
  @IsBoolean()
  allowed: boolean;

  @ApiPropertyOptional({ description: 'Why it is allowed (required for shared accounts by PCI DSS 8.2.2)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justification?: string;
}

export class AllowedAccountTypesDto {
  @ApiProperty({ type: [AllowedAccountTypeDto] })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AllowedAccountTypeDto)
  types: AllowedAccountTypeDto[];
}

export class RbacImportGroupDto {
  @ApiProperty({ description: 'System name to create or reuse' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ type: [String], description: 'Form system names folded into this system' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  sources: string[];
}

export class ImportRbacMatrixDto {
  @ApiPropertyOptional({
    type: [RbacImportGroupDto],
    description: 'Confirmed systems. Omit to preview the proposed grouping without saving.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RbacImportGroupDto)
  groups?: RbacImportGroupDto[];
}
