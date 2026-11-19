import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class RecordComputedMetricsDto {
  @ApiPropertyOptional({
    description:
      'previous (default) records the period that just ended; current takes a provisional snapshot of the running period, which the close-of-period value later replaces. Periods with a final value are skipped.',
    enum: ['current', 'previous'],
    example: 'previous',
  })
  @IsOptional()
  @IsIn(['current', 'previous'])
  period?: 'current' | 'previous';
}
