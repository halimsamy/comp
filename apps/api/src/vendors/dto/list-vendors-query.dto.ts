import { ApiPropertyOptional } from '@nestjs/swagger';
import { VendorCriticality, VendorStatus } from '@db';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

const CRITICALITY_FILTERS = [...Object.values(VendorCriticality), 'unset'];

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class ListVendorsQueryDto {
  @ApiPropertyOptional({
    enum: VendorStatus,
    description: 'Only vendors with this assessment status',
    example: 'not_assessed',
  })
  @IsOptional()
  @IsIn(Object.values(VendorStatus))
  status?: VendorStatus;

  @ApiPropertyOptional({
    enum: CRITICALITY_FILTERS,
    description: 'Only vendors with this criticality; "unset" = not classified',
    example: 'unset',
  })
  @IsOptional()
  @IsIn(CRITICALITY_FILTERS)
  criticality?: VendorCriticality | 'unset';

  @ApiPropertyOptional({
    description:
      'true = only archived vendors (relationship ended). Default: only current vendors.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    description:
      'true = only vendors that need attention (not assessed, unclassified, review overdue or never reviewed while in scope, documents expiring).',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  attention?: boolean;
}
