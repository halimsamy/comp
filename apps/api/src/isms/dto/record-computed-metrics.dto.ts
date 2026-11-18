import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class RecordComputedMetricsDto {
  @ApiPropertyOptional({
    description:
      'Period to record: the current one, or the one that just ended. Periods that already have a value are skipped.',
    enum: ['current', 'previous'],
    example: 'current',
  })
  @IsOptional()
  @IsIn(['current', 'previous'])
  period?: 'current' | 'previous';
}
