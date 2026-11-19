import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Every field optional: only the keys sent are changed. */
export class EmailPreferencesPatchDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  policyNotifications?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  taskReminders?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  weeklyTaskDigest?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  unassignedItemsNotifications?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  taskMentions?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  taskAssignments?: boolean;
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  findingNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Compliance digest (needs-attention summary)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  complianceDigest?: boolean;

  @ApiPropertyOptional({
    description: 'Emails when you are made owner of a record',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  ownershipAssignments?: boolean;

  @ApiPropertyOptional({
    description: 'Vulnerability and review SLA alerts',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  slaAlerts?: boolean;

  @ApiPropertyOptional({ enum: ['daily', 'weekly'], example: 'weekly' })
  @IsOptional()
  @IsIn(['daily', 'weekly'])
  digestFrequency?: 'daily' | 'weekly';

  @ApiPropertyOptional({ enum: ['daily', 'weekly'], example: 'weekly' })
  @IsOptional()
  @IsIn(['daily', 'weekly'])
  complianceDigestFrequency?: 'daily' | 'weekly';
}

export class PatchEmailPreferencesDto {
  @ApiProperty({ type: EmailPreferencesPatchDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => EmailPreferencesPatchDto)
  preferences: EmailPreferencesPatchDto;
}

/** Unsubscribe-link variant: proves the email address with its HMAC token instead of a session. */
export class PatchEmailPreferencesByTokenDto extends PatchEmailPreferencesDto {
  @ApiProperty({ example: 'ann@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Unsubscribe token from the email link' })
  @IsString()
  @MaxLength(512)
  token: string;
}
