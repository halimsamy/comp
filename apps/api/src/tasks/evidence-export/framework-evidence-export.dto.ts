import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ExportFrameworkEvidenceDto {
  @ApiPropertyOptional({
    description:
      'First day of the audit period (YYYY-MM-DD). Task attachments, automation runs and document submissions before it are left out.',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(DAY, { message: 'from must be a date in YYYY-MM-DD format' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Last day of the audit period (YYYY-MM-DD), inclusive. Evidence after it is left out.',
    example: '2026-12-31',
  })
  @IsOptional()
  @Matches(DAY, { message: 'to must be a date in YYYY-MM-DD format' })
  to?: string;
}

/** Day bounds of an audit period as ISO timestamps (UTC, inclusive). */
export function toPeriodBounds({ from, to }: ExportFrameworkEvidenceDto): {
  from?: string;
  to?: string;
} {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}
