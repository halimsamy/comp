import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePolicyReviewDto {
  @ApiPropertyOptional({
    description: 'What was reviewed and the outcome',
    example: 'Reviewed against ISO 27001:2022 A.5.1; no changes needed.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'When the next review is due (ISO 8601). Defaults to one review cycle from today based on the policy frequency.',
    example: '2027-11-18T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextReviewDate?: Date;

  @ApiPropertyOptional({
    description:
      'Ask employees to acknowledge the current version again. Earlier sign-offs stay in the history. Use for the yearly acknowledgement PCI DSS 12.6.3 expects.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  requireReacknowledgement?: boolean;
}
