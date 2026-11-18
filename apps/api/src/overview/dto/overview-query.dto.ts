import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TREND_RANGES_DAYS } from '../compliance-snapshots';

export class DeadlinesQueryDto {
  @ApiPropertyOptional({
    description: 'Due-soon window in days. Items due later are left out.',
    example: 30,
    minimum: 1,
    maximum: 365,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class TrendsQueryDto {
  @ApiPropertyOptional({
    description: 'History range in days.',
    enum: TREND_RANGES_DAYS,
    example: 90,
    default: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(TREND_RANGES_DAYS)
  days?: number;
}
