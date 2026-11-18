import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrgChartSnapshotDto {
  @ApiPropertyOptional({
    description: 'Snapshot name. Defaults to "Org chart YYYY-MM-DD".',
    example: 'Q4 2026 org chart',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
