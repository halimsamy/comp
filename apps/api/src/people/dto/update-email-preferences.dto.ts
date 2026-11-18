import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmptyObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EmailPreferencesDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  policyNotifications: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  taskReminders: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  weeklyTaskDigest: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  unassignedItemsNotifications: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  taskMentions: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  taskAssignments: boolean;

  @ApiPropertyOptional({
    description: 'How often the task digest is sent (default weekly, on Mondays)',
    enum: ['daily', 'weekly'],
    example: 'weekly',
  })
  @IsOptional()
  @IsIn(['daily', 'weekly'])
  digestFrequency?: 'daily' | 'weekly';
}

export class UpdateEmailPreferencesDto {
  @ApiProperty({ type: EmailPreferencesDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => EmailPreferencesDto)
  preferences: EmailPreferencesDto;
}
