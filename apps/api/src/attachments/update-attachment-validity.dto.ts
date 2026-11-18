import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, ValidateIf } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateAttachmentValidityDto {
  @ApiPropertyOptional({
    description: 'First day the file is valid evidence (YYYY-MM-DD)',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(DAY, { message: 'validFrom must be YYYY-MM-DD' })
  validFrom?: string;

  @ApiPropertyOptional({
    description: 'Last day the file is valid evidence (YYYY-MM-DD), or null for no end date',
    example: '2026-12-31',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(DAY, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil?: string | null;
}
