import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A device added by hand (no agent or integration); its checks are attested. */
export class CreateDeviceDto {
  @ApiProperty({ description: 'Member who uses the device', example: 'mem_abc123' })
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @ApiProperty({ description: 'Device name', example: "Jane's MacBook Pro" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Hostname (defaults to the name)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hostname?: string;

  @ApiProperty({ enum: ['macos', 'windows', 'linux'] })
  @IsIn(['macos', 'windows', 'linux'])
  platform: 'macos' | 'windows' | 'linux';

  @ApiProperty({ description: 'Operating system version', example: '15.1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  osVersion: string;

  @ApiPropertyOptional({ description: 'Hardware serial number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Hardware model', example: 'MacBook Pro 14"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hardwareModel?: string;

  @ApiProperty({ description: 'Disk encryption is on' })
  @IsBoolean()
  diskEncryptionEnabled: boolean;

  @ApiProperty({ description: 'Antivirus is running' })
  @IsBoolean()
  antivirusEnabled: boolean;

  @ApiProperty({ description: 'A password policy is enforced' })
  @IsBoolean()
  passwordPolicySet: boolean;

  @ApiProperty({ description: 'Screen lock is on' })
  @IsBoolean()
  screenLockEnabled: boolean;
}
