import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { REMINDER_FREQUENCIES, type ReminderFrequency } from '../employee-reminders';

export class SendRemindersDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Members to remind; omit to remind everyone with open security tasks',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  memberIds?: string[];
}

export class ReminderSettingsDto {
  @ApiProperty({ enum: REMINDER_FREQUENCIES, example: 'weekly' })
  @IsIn(REMINDER_FREQUENCIES)
  frequency: ReminderFrequency;
}
