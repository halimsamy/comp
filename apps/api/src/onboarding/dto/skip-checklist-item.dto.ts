import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SkipChecklistItemDto {
  @ApiProperty({
    description:
      'Why the team is skipping this step, e.g. "We have no cloud infrastructure".',
    example: 'We do not use a version control system.',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
